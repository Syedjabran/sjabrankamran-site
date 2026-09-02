import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { ArrowLeft, RotateCw } from 'lucide-react-native';
import { SITE_URL } from '../../src/config';
import { sessionCookiePairs, type Session } from '../../src/auth/session';
import { useAuth } from '../../src/auth/context';
import { ErrorNote, Screen, T } from '../../src/components/ui';
import { alpha, colors, spacing } from '../../src/theme/tokens';

/**
 * Renders a real portal page inside the app, already signed in.
 *
 * Surfaces like Exam Lab depend on browser-only technology (MediaPipe face and
 * object detection over WebAssembly), so they are shown as the genuine web page
 * rather than reimplemented — identical design, identical behaviour.
 *
 * The session is presented two ways because Android applies `headers` only to
 * the first request: the initial load carries a `Cookie` header, and
 * `injectedJavaScriptBeforeContentLoaded` writes the same cookie into
 * document.cookie so every in-page navigation stays authenticated. The auth
 * cookie is not httpOnly (the site's own browser client sets it via
 * document.cookie), so this is exactly how the website manages it.
 */
export default function WebScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const params = useLocalSearchParams<{ path?: string; title?: string }>();
  const path = params.path ?? '/portal';
  const title = params.title ?? 'Portal';

  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  // `path` may be a portal path ("/portal/exam-lab") or an absolute URL — a
  // resource's href is a signed storage link or a Google Drive URL.
  const isAbsolute = /^https?:\/\//i.test(path);
  const uri = isAbsolute ? path : SITE_URL + path;

  /**
   * The session is attached ONLY for our own origin. Resource links point at
   * Supabase storage and Google Drive, and sending the portal's auth cookie to
   * a third-party host would hand them the user's session.
   */
  const isOwnOrigin = !isAbsolute || uri.startsWith(SITE_URL);

  const cookiePairs = useMemo(
    () => (session && isOwnOrigin ? sessionCookiePairs(session as Session) : []),
    [session, isOwnOrigin]
  );

  const cookieHeader = useMemo(
    () => cookiePairs.map(([k, v]) => `${k}=${v}`).join('; '),
    [cookiePairs]
  );

  /** Writes the session cookie into the WebView before the page's own JS runs. */
  const injectedCookieScript = useMemo(() => {
    if (!cookiePairs.length) return '';
    const host = SITE_URL.replace(/^https?:\/\//, '');
    const domain = host.startsWith('www.') ? host.slice(4) : host;
    const statements = cookiePairs
      .map(
        ([name, value]) =>
          `document.cookie = ${JSON.stringify(
            `${name}=${value}; path=/; domain=.${domain}; max-age=3600; SameSite=Lax; Secure`
          )};`
      )
      .join('\n');
    return `(function(){try{${statements}}catch(e){}})(); true;`;
  }, [cookiePairs]);

  // Hardware back button walks the WebView's own history first.
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
      <View style={styles.bar}>
        <Pressable
          onPress={() => (canGoBack ? webRef.current?.goBack() : router.back())}
          hitSlop={10}
          style={styles.iconBtn}
          accessibilityLabel="Back"
        >
          <ArrowLeft size={16} color={colors.fog} />
        </Pressable>
        <T weight="display" size="base" numberOfLines={1} style={{ flex: 1 }}>
          {title}
        </T>
        <Pressable
          onPress={() => webRef.current?.reload()}
          hitSlop={10}
          style={styles.iconBtn}
          accessibilityLabel="Reload"
        >
          <RotateCw size={15} color={colors.fog} />
        </Pressable>
      </View>

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
            source={
              cookieHeader ? { uri, headers: { Cookie: cookieHeader } } : { uri }
            }
            injectedJavaScriptBeforeContentLoaded={injectedCookieScript}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            domStorageEnabled
            javaScriptEnabled
            // Exam Lab's proctor needs the camera; grant it without a second prompt
            // once the OS permission has been granted to the app.
            mediaPlaybackRequiresUserAction={false}
            allowsInlineMediaPlayback
            originWhitelist={['https://*']}
            onNavigationStateChange={onNavigationStateChange}
            onLoadEnd={() => setLoading(false)}
            onError={() =>
              setFailed('Could not load this page. Check your connection and try again.')
            }
            style={styles.web}
            containerStyle={styles.webContainer}
          />
          {loading ? (
            <View style={styles.loader} pointerEvents="none">
              <ActivityIndicator color={colors.cyan} />
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
  loader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.abyss,
  },
});
