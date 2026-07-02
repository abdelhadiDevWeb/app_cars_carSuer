import * as WebBrowser from 'expo-web-browser';
import { Linking, Platform } from 'react-native';

export type OpenChargilyCheckoutResult = 'browser_closed' | 'external_launched' | 'failed';

function isValidHttpUrl(url: string): boolean {
  return /^https?:\/\/.+/i.test(url.trim());
}

/**
 * Opens a Chargily Pay checkout URL.
 * Prefers expo-web-browser (Custom Tabs / SFSafariViewController) — required for
 * reliable payment pages on mobile. Falls back to Linking for external browser.
 */
export async function openChargilyCheckoutUrl(
  checkoutUrl: string
): Promise<OpenChargilyCheckoutResult> {
  const url = checkoutUrl.trim();
  if (!isValidHttpUrl(url)) {
    return 'failed';
  }

  try {
    await WebBrowser.openBrowserAsync(url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      dismissButtonStyle: 'close',
      showTitle: true,
      enableBarCollapsing: false,
      ...(Platform.OS === 'android'
        ? { createTask: false, showInRecents: true }
        : {}),
    });
    return 'browser_closed';
  } catch (webErr) {
    console.warn('[Chargily] in-app browser failed:', webErr);
  }

  try {
    await Linking.openURL(url);
    return 'external_launched';
  } catch (linkErr) {
    console.warn('[Chargily] Linking.openURL failed:', linkErr);
  }

  return 'failed';
}

/** Warm up Custom Tabs on Android for faster checkout open. */
export function warmUpChargilyBrowser(): void {
  void WebBrowser.warmUpAsync().catch(() => {});
}
