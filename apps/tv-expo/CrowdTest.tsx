import React, { useEffect } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

/** The laptop's crowd prototype, reached through `adb reverse tcp:8091 tcp:8091` (the packed copy in the APK is
 * `file:///android_asset/crowd/index.html`: pass it as `url=` to test what ships). */
export const CROWD_TEST_URL = 'http://localhost:8091/index.html';

/** Copies the page's `[crowd]` console lines to the host. */
const FORWARD_CROWD_LOGS = `(function () {
  var log = console.log;
  console.log = function () {
    try {
      var s = Array.prototype.join.call(arguments, ' ');
      if (s.indexOf('[crowd]') === 0 && window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s);
    } catch (e) {}
    return log.apply(console, arguments);
  };
})();
true;`;

/**
 * A device test for the live 3D crowd: the prototype in the system WebView (WebGL), full screen, so its frame-time HUD
 * shows what this TV's GPU can actually draw. Opened with
 * `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=<encoded url>"`; Back leaves.
 */
export function CrowdTest({ url = CROWD_TEST_URL, onExit }: { url?: string; onExit: () => void }) {
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onExit();
      return true;
    });
    return () => sub.remove();
  }, [onExit]);
  return (
    <View style={styles.fill}>
      <WebView
        source={{ uri: url }}
        style={styles.fill}
        javaScriptEnabled
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        originWhitelist={['*']}
        allowFileAccess
        allowFileAccessFromFileURLs
        androidLayerType="hardware"
        overScrollMode="never"
        setSupportMultipleWindows={false}
        // The page's `log=1` sweep lines (`[crowd] sweep …`) reach logcat through here: the WebView's own console is not
        // forwarded on every Android TV.
        injectedJavaScriptBeforeContentLoaded={FORWARD_CROWD_LOGS}
        onMessage={(e) => {
          const d = e.nativeEvent.data;
          if (typeof d === 'string' && d.indexOf('[crowd]') === 0) console.log(d);
        }}
      />
    </View>
  );
}

/** `com.strumble.tv://crowdtest?url=…` → the test URL; anything else → null (the app runs normally). */
export function crowdTestUrl(link: string | null): string | null {
  if (!link || !/^com\.strumble\.tv:\/\/crowdtest/.test(link)) return null;
  const m = /[?&]url=([^&]+)/.exec(link);
  return m ? decodeURIComponent(m[1]) : CROWD_TEST_URL;
}

/** `com.strumble.tv://stage?crowd=3d` → true, `…?crowd=off` → false; any other link → undefined (no change). */
export function stageLink(link: string | null): boolean | undefined {
  if (!link || !/^com\.strumble\.tv:\/\/stage/.test(link)) return undefined;
  const m = /[?&]crowd=([^&]+)/.exec(link);
  return m ? m[1] === '3d' : undefined;
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#07060a' },
});
