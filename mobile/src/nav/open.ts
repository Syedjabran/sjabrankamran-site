import { useCallback } from 'react';
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

/**
 * Opens a link that arrived as data (a resource, a task's resource, a
 * notification): a page of the portal's own origin in the signed-in WebView;
 * any other website in the phone's browser, never with the session; anything
 * else not at all. Returns whether it opened.
 */
export function useOpenLink() {
  const router = useRouter();
  return useCallback(
    (link: string | null | undefined, title: string): boolean => {
      const target = resolveWebTarget(link, SITE_ORIGIN);
      if (target.kind === 'portal') {
        router.push({ pathname: '/web', params: { path: target.path, title } });
      } else if (target.kind === 'external') {
        void Linking.openURL(target.url).catch(() => undefined);
      }
      return target.kind !== 'refused';
    },
    [router]
  );
}
