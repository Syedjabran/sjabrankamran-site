// The lab room's link to the Practical Lab API. The physics models, each
// attempt's hidden values and the instrument noise live on the server
// (src/lib/practical-lab); this module only keeps the room's own state
// (settings, running, elapsed time) and plays back the trial tracks the
// server sends, so what reaches the browser is what the apparatus and the
// instruments show -- never a model, a hidden value or an ideal result.
const API = '/api/lab';
const LED = 'led_ldr_photoresistance';

export class LabError extends Error {
  constructor(message, status = 0, code = '') { super(message); this.status = status; this.code = code; }
}

async function post(path, body) {
  let res;
  try {
    res = await fetch(`${API}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin', cache: 'no-store' });
  } catch {
    throw new LabError('The lab couldn’t reach the server. Check your connection and try again.', 0, 'network');
  }
  let data = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) throw new LabError(data?.error || 'The lab couldn’t do that just now. Please try again.', res.status, data?.code || '');
  return data;
}

// A chunk of a track as full frames: constant fields, numeric series and
// change-point steps (the server's encodeFrames), plus its meter readings.
function decodeChunk(track) {
  const { count, constant, series, steps } = track.frames;
  const frames = Array.from({ length: count }, (_, i) => {
    const f = { ...constant };
    for (const [k, values] of Object.entries(series)) f[k] = values[i];
    return f;
  });
  for (const [k, changes] of Object.entries(steps)) {
    changes.forEach(([at, value], j) => {
      const until = j + 1 < changes.length ? changes[j + 1][0] : count;
      for (let i = at; i < until; i++) frames[i][k] = value;
    });
  }
  return { first: track.first, count, frames, meters: track.meters?.readings ?? null };
}

const mix = (a, b, f) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(a)) if (typeof v === 'number' && typeof b[k] === 'number') out[k] = v + (b[k] - v) * f;
  return out;
};

/** Open (or resume) this student's attempt at a practical. */
export async function createExperiment(id) {
  let opened = await post('attempt', { experiment: id });
  let attempt = opened.attempt;
  const { controls, family, timing } = opened;
  const settings = Object.fromEntries(controls.map((c) => [c.key, c.value]));
  const restViews = new Map([[JSON.stringify(settings), opened.view]]);
  let lastView = { ...opened.view }, elapsed = 0, active = false, closed = false, run = 0, generation = 0, track = null, history = [];
  let problem = null;

  // Every request that reads or changes the apparatus goes through one queue,
  // in the order the room asked: a reading asked for right after an
  // adjustment waits for it and reads the new setting, and a reset never
  // lands in the middle of an adjustment.
  let queue = Promise.resolve();
  function serial(task) {
    const next = queue.then(task);
    queue = next.catch(() => {});
    return next;
  }

  // An expired token (12 h) is renewed quietly by resuming the same attempt;
  // if a fresh attempt has replaced it meanwhile, the student is told.
  const superseded = () => new LabError('This practical was restarted as a fresh attempt (perhaps in another tab). Reload the page to carry on with the new apparatus.', 409, 'superseded');
  async function call(path, body) {
    try {
      return await post(path, { ...body, attempt });
    } catch (error) {
      if (error.code !== 'expired') throw error;
      const again = await post('attempt', { experiment: id });
      if (again.n !== opened.n) throw superseded();
      attempt = again.attempt;
      return post(path, { ...body, attempt });
    }
  }

  const restKey = () => JSON.stringify(settings);
  // LED only: the light response carries over between live adjustments, so
  // the server replays when each one happened. Older changes have long since
  // settled (the response takes well under a second), so a trimmed history
  // starts again from time zero.
  const serverHistory = () => {
    if (family !== LED || !active) return undefined;
    const recent = history.slice(-32).map((h) => ({ t: h.t, settings: h.settings }));
    if (recent.length) recent[0] = { ...recent[0], t: 0 };
    return recent;
  };
  const state = () => ({ active, closed, t: active ? elapsed : 0, run, ...(family === LED && active ? { history: serverHistory() } : {}) });

  function newTrack(first) {
    return { fps: first.fps, perChunk: timing.timed ? timing.fps * timing.chunkSeconds : 1, chunks: new Map([[0, decodeChunk(first)]]), pending: new Set(), failures: new Map(), last: first.done ? 0 : null, version: 0 };
  }
  // A chunk that fails is asked for again after 3 s, up to three times; then,
  // or at once when retrying can't help (signed out, no access, a replaced
  // attempt), the student gets a plain message and the playback holds.
  const CHUNK_TRIES = 3;
  const FINAL = new Set([401, 403, 409, 423]);
  function fetchChunk(k) {
    if (!track || !timing.timed || track.chunks.has(k) || track.pending.has(k) || (track.last !== null && k > track.last)) return;
    if ((track.failures.get(k) ?? 0) >= CHUNK_TRIES) return;
    const mine = track, version = track.version;
    mine.pending.add(k);
    call('trial', { settings, state: { run, history: serverHistory() }, chunk: k })
      .then((data) => {
        if (track !== mine || mine.version !== version) return; // superseded (reset, or an LED adjustment)
        mine.pending.delete(k);
        mine.failures.delete(k);
        mine.chunks.set(k, decodeChunk(data.track));
        if (data.track.done) mine.last = k;
      })
      .catch((error) => {
        if (track !== mine || mine.version !== version) return;
        const failures = (mine.failures.get(k) ?? 0) + 1;
        mine.failures.set(k, FINAL.has(error.status) ? CHUNK_TRIES : failures);
        if (FINAL.has(error.status)) problem = error.message;
        else if (failures >= CHUNK_TRIES) problem = 'The lab couldn’t load the rest of this trial. Reset the trial and release again to carry on.';
        setTimeout(() => mine.pending.delete(k), 3000);
      });
  }
  /** Global frame g: from its chunk, or the latest loaded frame before it. */
  function frameAt(g) {
    if (!track) return null;
    for (let k = Math.floor(g / track.perChunk); k >= 0; k--) {
      const c = track.chunks.get(k);
      if (c) return { frame: c.frames[Math.min(c.count - 1, Math.max(0, g - c.first))], chunk: c };
    }
    return null;
  }
  function viewAtElapsed() {
    if (!track) return null;
    if (!timing.timed) return track.chunks.get(0).frames[0];
    const g = elapsed * track.fps, g0 = Math.floor(g);
    const here = frameAt(g0), next = frameAt(g0 + 1);
    if (!here) return null;
    return next && next.frame !== here.frame ? mix(here.frame, next.frame, g - g0) : here.frame;
  }
  function prefetch() {
    if (!track || !timing.timed) return;
    const k = Math.floor(elapsed / timing.chunkSeconds);
    for (const old of [...track.chunks.keys()]) if (old < k - 1) track.chunks.delete(old);
    fetchChunk(k);
    if (elapsed - k * timing.chunkSeconds > timing.chunkSeconds / 2) fetchChunk(k + 1);
  }

  /** Release / close the switch: the server sends the first part of the track. */
  const start = () => serial(async () => {
    const gen = ++generation;
    const nextRun = run + 1;
    const startHistory = family === LED ? [{ t: 0, settings: { ...settings } }] : [];
    const data = await call('trial', { settings, state: { run: nextRun, ...(family === LED ? { history: startHistory } : {}) }, chunk: 0 });
    if (gen !== generation) throw new LabError('The trial was reset before it started.', 0, 'superseded');
    run = nextRun; history = startHistory; elapsed = 0; active = true; closed = true; problem = null;
    track = newTrack(data.track);
    lastView = { ...lastView, ...viewAtElapsed() };
    return lastView;
  });
  const reset = () => serial(async () => {
    generation++; elapsed = 0; active = closed = false; track = null; history = []; problem = null;
    const key = restKey();
    const v = restViews.get(key) ?? (await call('view', { settings })).view;
    restViews.set(key, v);
    lastView = { ...lastView, ...v };
    return lastView;
  });
  /** Change a control. Rejects (and changes nothing) when the apparatus
   *  doesn't allow the setting; the message says why. */
  const set = (key, value) => serial(async () => {
    const next = { ...settings, [key]: value };
    const running = active, at = elapsed, gen = generation;
    const body = { settings: next };
    if (running) body.state = { active, closed, t: elapsed, run };
    const { view: v } = await call('view', body);
    settings[key] = value;
    if (gen !== generation) return lastView; // a reset or release happened meanwhile: its view stands
    if (!running) restViews.set(restKey(), v);
    // A live adjustment of an untimed rig (a circuit, the rod's pull) is now
    // its running view; the LED's meters are re-fetched from the adjustment on.
    if (running && track && !timing.timed) track.chunks.set(0, { first: 0, count: 1, frames: [v], meters: null });
    if (family === LED && active) {
      history.push({ t: at, settings: { ...settings } });
      if (track) {
        const k = Math.floor(at / timing.chunkSeconds);
        track.version++;
        track.pending.clear();
        track.failures.clear();
        for (const c of [...track.chunks.keys()]) if (c >= k) track.chunks.delete(c);
        track.last = null;
        fetchChunk(k);
      }
    }
    lastView = { ...lastView, ...v };
    return lastView;
  });
  /** One animation frame: plays the track (no request per frame). */
  function advance(dt) {
    if (!Number.isFinite(dt) || dt < 0 || dt > .25) throw new RangeError('Use a frame step from 0 to 0.25 s');
    if (active) {
      elapsed += dt;
      prefetch();
      const v = viewAtElapsed();
      if (v) lastView = { ...lastView, ...v };
    }
    return lastView;
  }
  const view = () => serial(async () => {
    const { view: v } = await call('view', { settings, state: state() });
    lastView = { ...lastView, ...v };
    return lastView;
  });
  /** What the instruments show now, for the settings as they are once every
   *  adjustment asked for before this has been made. */
  const sample = () => serial(async () => (await call('sample', { settings, state: state() })).readings);
  /** The live meters at this moment of a running trial (from the track), or
   *  null when the track has none for now. */
  function liveReadings() {
    if (!active || !track || !timing.meterSeconds) return null;
    const g = Math.floor(elapsed * track.fps);
    const found = frameAt(g);
    if (!found?.chunk.meters) return null;
    let best = null;
    for (const [at, readings] of found.chunk.meters) { if (at > g) break; best = readings; }
    return best ? { ...best } : null;
  }
  /** Start a fresh attempt: the same practical on a new apparatus. */
  const fresh = () => serial(async () => {
    opened = await post('attempt', { experiment: id, fresh: true });
    attempt = opened.attempt;
    restViews.clear();
    generation++; elapsed = 0; active = closed = false; track = null; history = []; problem = null;
    const { view: v } = await call('view', { settings });
    restViews.set(restKey(), v);
    lastView = { ...v };
    return lastView;
  });
  /** A problem the student should know about (a trial that can't load), once. */
  function takeProblem() {
    const message = problem;
    problem = null;
    return message;
  }

  return {
    controls, settings, family, start, reset, set, advance, view, sample, liveReadings, fresh, takeProblem,
    /** Resolves once every request asked for so far has finished. */
    settled: () => queue,
    currentView: () => lastView,
    openSwitch() { closed = false; },
    get attemptNumber() { return opened.n; },
    get active() { return active; }, get elapsed() { return elapsed; }, get closed() { return closed; },
  };
}
