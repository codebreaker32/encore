// Vega only (babel.config.js): shared-ui's clips and sounds play from the package's assets/raw/ folder.
// w3cmedia can't open Metro's bundle assets (file:///pkg/bundle/assets/…), nor data: or http:, but it does open
// /pkg/assets/raw/<file> (Amazon's forum, thread 27642; verified on the VVD 2026-10-11). So require('…/assets/clips/x.mp4')
// and require('…/assets/sounds/x.mp3') become { uri: '/pkg/assets/raw/media/clips/x.mp4' }, which world/sound.vega.ts
// `mediaUris` reads, and Metro no longer bundles a second copy. tools/copy-media.mjs puts the files there before a build.
const MEDIA = /\/assets\/(clips|sounds)\/([^/]+\.(?:mp4|mp3))$/;

module.exports = function rawMedia({ types: t }) {
  return {
    name: 'encore-raw-media',
    visitor: {
      CallExpression(path) {
        if (!path.get('callee').isIdentifier({ name: 'require' })) return;
        const arg = path.node.arguments[0];
        if (!arg || arg.type !== 'StringLiteral') return;
        const m = MEDIA.exec(arg.value);
        if (!m) return;
        path.replaceWith(t.objectExpression([t.objectProperty(t.identifier('uri'), t.stringLiteral(`/pkg/assets/raw/media/${m[1]}/${m[2]}`))]));
      },
    },
  };
};
