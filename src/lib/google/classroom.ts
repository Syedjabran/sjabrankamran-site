/** Google Classroom (read) for the connected teacher account. SERVER-ONLY. */
import { googleGet } from "./auth";

export type Course = { id: string; name: string; section: string | null; description: string | null; room: string | null; enrolmentCode: string | null; alternateLink: string | null; courseState: string | null };

export type Material = { kind: "drive" | "youtube" | "link" | "form"; title: string; url: string | null; thumbnailUrl: string | null };
export type CourseWork = { id: string; title: string; description: string | null; workType: string | null; dueDate: string | null; alternateLink: string | null; materials: Material[] };

type RawCourse = { id: string; name: string; section?: string; description?: string; room?: string; enrollmentCode?: string; alternateLink?: string; courseState?: string };

/** Safety cap on pages followed (100 items each). */
const MAX_PAGES = 20;

/** GET every page of a Classroom list endpoint (follows nextPageToken). */
async function listAll<T>(url: string, key: string): Promise<T[]> {
  const out: T[] = [];
  let pageToken = "";
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await googleGet<Record<string, unknown> & { nextPageToken?: string }>(pageToken ? `${url}&pageToken=${encodeURIComponent(pageToken)}` : url);
    out.push(...((data[key] as T[] | undefined) || []));
    pageToken = data.nextPageToken || "";
    if (!pageToken) break;
  }
  return out;
}

export async function listCourses(): Promise<Course[]> {
  const courses = await listAll<RawCourse>("https://classroom.googleapis.com/v1/courses?pageSize=100&courseStates=ACTIVE&courseStates=PROVISIONED", "courses");
  return courses.map((c) => ({
    id: c.id, name: c.name, section: c.section || null, description: c.description || null,
    room: c.room || null, enrolmentCode: c.enrollmentCode || null, alternateLink: c.alternateLink || null, courseState: c.courseState || null,
  }));
}

type RawMaterial = {
  driveFile?: { driveFile?: { title?: string; alternateLink?: string; thumbnailUrl?: string } };
  youtubeVideo?: { title?: string; alternateLink?: string; thumbnailUrl?: string };
  link?: { title?: string; url?: string; thumbnailUrl?: string };
  form?: { title?: string; formUrl?: string; thumbnailUrl?: string };
};
type RawWork = { id: string; title: string; description?: string; workType?: string; alternateLink?: string; dueDate?: { year: number; month: number; day: number }; materials?: RawMaterial[] };

function mapMaterials(raw: RawMaterial[] = []): Material[] {
  const out: Material[] = [];
  for (const m of raw) {
    if (m.driveFile?.driveFile) out.push({ kind: "drive", title: m.driveFile.driveFile.title || "Drive file", url: m.driveFile.driveFile.alternateLink || null, thumbnailUrl: m.driveFile.driveFile.thumbnailUrl || null });
    else if (m.youtubeVideo) out.push({ kind: "youtube", title: m.youtubeVideo.title || "Video", url: m.youtubeVideo.alternateLink || null, thumbnailUrl: m.youtubeVideo.thumbnailUrl || null });
    else if (m.link) out.push({ kind: "link", title: m.link.title || m.link.url || "Link", url: m.link.url || null, thumbnailUrl: m.link.thumbnailUrl || null });
    else if (m.form) out.push({ kind: "form", title: m.form.title || "Form", url: m.form.formUrl || null, thumbnailUrl: m.form.thumbnailUrl || null });
  }
  return out;
}

export async function listCourseWork(courseId: string): Promise<CourseWork[]> {
  const work = await listAll<RawWork>(`https://classroom.googleapis.com/v1/courses/${encodeURIComponent(courseId)}/courseWork?pageSize=100&orderBy=updateTime%20desc`, "courseWork");
  return work.map((w) => ({
    id: w.id, title: w.title, description: w.description || null, workType: w.workType || null,
    alternateLink: w.alternateLink || null,
    dueDate: w.dueDate ? `${w.dueDate.year}-${String(w.dueDate.month).padStart(2, "0")}-${String(w.dueDate.day).padStart(2, "0")}` : null,
    materials: mapMaterials(w.materials),
  }));
}

/** Course "materials" posts (announcements-with-materials, not graded work). */
export async function listCourseWorkMaterials(courseId: string): Promise<CourseWork[]> {
  const materials = await listAll<RawWork>(`https://classroom.googleapis.com/v1/courses/${encodeURIComponent(courseId)}/courseWorkMaterials?pageSize=100&orderBy=updateTime%20desc`, "courseWorkMaterial");
  return materials.map((w) => ({
    id: w.id, title: w.title, description: w.description || null, workType: "MATERIAL",
    alternateLink: w.alternateLink || null, dueDate: null, materials: mapMaterials(w.materials),
  }));
}
