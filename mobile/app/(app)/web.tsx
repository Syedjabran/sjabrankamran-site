import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation, type WebViewProps } from 'react-native-webview';
import { ArrowLeft, ExternalLink, RotateCw } from 'lucide-react-native';
import { PORTAL_CLIENT_APP, PORTAL_CLIENT_COOKIE, PORTAL_NAME, SITE_ORIGIN } from '../../src/config';
import { sessionCookiePairs } from '../../src/auth/session';
import { useAuth } from '../../src/auth/context';
import { Button, Card, ErrorNote, Screen, T } from '../../src/components/ui';
import { SkeletonDocument, TopProgressBar } from '../../src/components/Skeleton';
import { navigationDecision, resolveWebTarget, type WebTarget } from '../../src/web/portal-url';
import { cookieHeader, sessionCookieScript } from '../../src/web/session-script';
import { alpha, colors, spacing } from '../../src/theme/tokens';

/** How long the session cookie written into the page lives (the access token's life). */
const SESSION_COOKIE_SECONDS = 60 * 60;
/** The app marker lives for a year: it only says "inside the app". */
const APP_MARKER_SECONDS = 60 * 60 * 24 * 365;
const APP_MARKER = [PORTAL_CLIENT_COOKIE, PORTAL_CLIENT_APP] as const;

type ShouldStartLoadRequest = Parameters<NonNullable<WebViewProps['onShouldStartLoadWithRequest']>>[0];
type OpenWindowEvent = Parameters<NonNullable<WebViewProps['onOpenWindow']>>[0];

/**
 * Shows a real portal page inside the app, already signed in -- the
 * modules without a native screen (Exam Lab, the SAT Lab and its tutor,
 * Practical Lab, the staff consoles, and any page the portal adds later).
 * The portal hides its own top bar here (the `portal_client=app` cookie).
 *
 * `path` arrives from the app's own screens and from deep links
 * (`sjkportal://web?path=...`) alike, and both go through the same exact-origin
 * check (src/web/portal-url.ts): only the portal's own origin opens here, with
 * the session; another website opens in the phone's browser after the user
 * says so, without it; anything else is refused.
 */
export default function WebScreen() {
  const params = useLocalSearchParams<{ path?: string | string[]; title?: string | string[] }>();
  const title = typeof params.title === 'string' && params.title.trim() ? params.title : PORTAL_NAME;
  const target = useMemo(() => resolveWebTarget(params.path ?? '/portal', SITE_ORIGIN), [params.path]);

  // Keyed by URL: this is a tab route, so opening another page only changes
  // its params. A fresh PortalPage starts from its placeholder instead of
  // leaving the previous page painted until the new one renders.
  if (target.kind === 'portal') return <PortalPage key={target.url} url={target.url} title={title} />;
  return <OutsideLink target={target} title={title} />;
}

function TitleBar({ title, onBack, onReload }: { title: string; onBack: () => void; onReload?: () => void }) {
  return (
    <View style={styles.bar}>
      <Pressable onPress={onBack} hitSlop={10} style={styles.iconBtn} accessibilityLabel="Back">
        <ArrowLeft size={16} color={colors.fog} />
      </Pressable>
      <T weight="display" size="base" numberOfLines={1} style={{ flex: 1 }}>
        {title}
      </T>
      {onReload ? (
        <Pressable onPress={onReload} hitSlop={10} style={styles.iconBtn} accessibilityLabel="Reload">
          <RotateCw size={15} color={colors.fog} />
        </Pressable>
      ) : null}
    </View>
  );
}

function useGoBack() {
  const router = useRouter();
  return useCallback(() => (router.canGoBack() ? router.back() : router.replace('/')), [router]);
}

/** A link that isn't the portal: another website opens in the phone's
 *  browser (never here, never with the session) once the user says so;
 *  anything else is refused. */
function OutsideLink({ target, title }: { target: Exclude<WebTarget, { kind: 'portal' }>; title: string }) {
  const insets = useSafeAreaInsets();
  const goBack = useGoBack();
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <TitleBar title={title} onBack={goBack} />
      <Screen>
        {target.kind === 'external' ? (
          <Card>
            <T weight="semibold" size="base">
              This link leaves the {PORTAL_NAME}
            </T>
            <T tone="fog" size="sm" style={{ marginTop: spacing.sm }}>
              {`It opens ${target.host} in your browser. Your portal sign-in is not shared with it.`}
            </T>
            <Button
              label="Open in browser"
              icon={<ExternalLink size={14} color={colors.space} />}
              onPress={() => void Linking.openURL(target.url).catch(() => undefined)}
              style={{ marginTop: spacing.lg, alignSelf: 'flex-start' }}
            />
          </Card>
        ) : (
          <ErrorNote message="This link can’t be opened in the app." />
        )}
      </Screen>
    </View>
  );
}

/**
 * A portal page in the signed-in WebView. The session goes two ways because
 * Android applies request headers to the first load only: a `Cookie` header
 * on the first request, and a script that writes the same cookies (host-only,
 * and only on the portal's own origin) before the page's own scripts run, so
 * in-page navigation stays signed in. The auth cookie is not httpOnly (the
 * website's own browser client sets it through document.cookie), so this is
 * how the website itself holds it.
 */
function PortalPage({ url, title }: { url: string; title: string }) {
  const insets = useSafeAreaInsets();
  const goBack = useGoBack();
  const { session } = useAuth();
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [canGoBack, setCanGoBack] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const pairs = useMemo(() => (session ? sessionCookiePairs(session) : []), [session]);
  // The first request's cookies, fixed for this page: a token refresh later
  // must not change `source`, which would reload the page mid-test.
  const [source] = useState(() => ({ uri: url, headers: { Cookie: cookieHeader([...pairs, APP_MARKER]) } }));

  // The page's cookies before its content loads, on the portal's origin only.
  const injected = useMemo(
    () =>
      sessionCookieScript(SITE_ORIGIN, [
        ...pairs.map(([name, value]) => [name, value, SESSION_COOKIE_SECONDS] as const),
        [...APP_MARKER, APP_MARKER_SECONDS] as const,
      ]),
    [pairs]
  );

  // Hardware back walks the WebView's own history first.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack) {
        webRef.current?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  /** Every navigation the page makes: the portal loads here; another website
   *  goes to the phone's browser; anything else goes nowhere. */
  const onShouldStartLoadWithRequest = useCallback((request: ShouldStartLoadRequest) => {
    const decision = navigationDecision(request.url, request.isTopFrame !== false, SITE_ORIGIN);
    if (decision === 'hand-off') void Linking.openURL(request.url).catch(() => undefined);
    return decision === 'load';
  }, []);

  /** A link that asks for a new window: a portal page opens here (keeping
   *  the back history); another website in the phone's browser. */
  const onOpenWindow = useCallback((event: OpenWindowEvent) => {
    const next = resolveWebTarget(event.nativeEvent.targetUrl, SITE_ORIGIN);
    if (next.kind === 'portal') {
      webRef.current?.injectJavaScript(`location.assign(${JSON.stringify(next.url)});true;`);
    } else if (next.kind === 'external') {
      void Linking.openURL(next.url).catch(() => undefined);
    }
  }, []);

  function onNavigationStateChange(nav: WebViewNavigation) {
    setCanGoBack(nav.canGoBack);
  }

  if (!session) {
    return (
      <Screen>
        <ErrorNote message="Your session has expired. Please sign in again." />
      </Screen>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <TitleBar
        title={title}
        onBack={() => (canGoBack ? webRef.current?.goBack() : goBack())}
        onReload={() => webRef.current?.reload()}
      />

      {failed ? (
        <Screen>
          <ErrorNote
            message={failed}
            onRetry={() => {
              setFailed(null);
              webRef.current?.reload();
            }}
          />
        </Screen>
      ) : (
        <View style={{ flex: 1 }}>
          <WebView
            ref={webRef}
            source={source}
            injectedJavaScriptBeforeContentLoaded={injected}
            // Every navigation goes through onShouldStartLoadWithRequest: the
            // library's own origin list matches by prefix, so it can't be
            // the check (and it would hand unknown schemes to the phone).
            originWhitelist={['*']}
            onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
            onOpenWindow={onOpenWindow}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            domStorageEnabled
            javaScriptEnabled
            // Exam Lab's proctor needs the camera; grant it without a second prompt
            // once the OS permission has been granted to the app.
            mediaPlaybackRequiresUserAction={false}
            allowsInlineMediaPlayback
            onNavigationStateChange={onNavigationStateChange}
            onLoadStart={() => {
              setProgress(0);
              setLoading(true);
            }}
            onLoadProgress={({ nativeEvent }) => setProgress(nativeEvent.progress)}
            onLoadEnd={() => {
              setProgress(1);
              setLoading(false);
            }}
            onError={() => setFailed('Could not load this page. Check your connection and try again.')}
            style={styles.web}
            containerStyle={styles.webContainer}
          />
          <View style={styles.progress} pointerEvents="none">
            <TopProgressBar progress={progress} visible={loading} />
          </View>
          {loading ? (
            <View style={styles.loader} pointerEvents="none">
              <SkeletonDocument />
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.abyss },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: alpha.divider,
  },
  iconBtn: {
    height: 32,
    width: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: alpha.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  web: { flex: 1, backgroundColor: colors.abyss },
  webContainer: { flex: 1, backgroundColor: colors.abyss },
  progress: { position: 'absolute', top: 0, left: 0, right: 0 },
  loader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.abyss,
    alignItems: 'stretch',
    justifyContent: 'flex-start',
  },
});
