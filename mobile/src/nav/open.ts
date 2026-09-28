import { useCallback, useState } from 'react';
import { Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { SITE_ORIGIN } from '../config';
import { resolveWebTarget } from '../web/portal-url';
import { openTargetFor, type AppPlace, type AppSubject } from './nav';

/** Opens a place from the portal's navigation: its native screen, the
 *  generic subject screen, or its portal page in the signed-in WebView. */
export function useOpenPlace() {
  const router = useRouter();
  return useCallback(
    (place: AppPlace | AppSubject) => {
      const target = openTargetFor(place);
      if (target.kind === 'native') {
        router.push(target.params ? { pathname: target.pathname, params: target.params } : target.pathname);
      } else {
        router.push({ pathname: '/web', params: { path: target.path, title: target.title } });
      }
    },
    [router]
  );
}

/** What a screen says under an item whose link couldn't be opened. */
export const LINK_REFUSED = 'This link can’t be opened in the app.';

/**
 * Opens a link that arrived as data (a resource, a task's resource, a
 * notification): a page of the portal's site in the signed-in WebView; any
 * other website in the phone's browser, never with the session; anything
 * else not at all. `refused` is the `key` of the last item whose link
 * couldn't be opened (refused, or the phone had nothing to open it with),
 * so the screen can say so under that item (LINK_REFUSED).
 */
export function useOpenLink() {
  const router = useRouter();
  const [refused, setRefused] = useState<string | null>(null);
  const openLink = useCallback(
    (link: string | null | undefined, title: string, key: string) => {
      const target = resolveWebTarget(link, SITE_ORIGIN);
      if (target.kind === 'portal') {
        setRefused(null);
        router.push({ pathname: '/web', params: { path: target.path, title } });
      } else if (target.kind === 'external') {
        setRefused(null);
        Linking.openURL(target.url).catch(() => setRefused(key));
      } else {
        setRefused(key);
      }
    },
    [router]
  );
  return { openLink, refused };
}
