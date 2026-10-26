// 示範模式（js/platform/video-source.js，10/26 提案）：哪些檔案當成影片、哪些瀏覽器能用
import test from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeVideo, videoFileSupported } from '../js/platform/video-source.js';

test('選到的檔案：影片類型或沒有類型（讓瀏覽器試著播）才收；其他的、被改過的值不收', () => {
    assert.equal(looksLikeVideo({ type: 'video/mp4' }), true);
    assert.equal(looksLikeVideo({ type: 'video/webm' }), true);
    assert.equal(looksLikeVideo({ type: '' }), true);
    assert.equal(looksLikeVideo({ type: 'text/plain' }), false);
    assert.equal(looksLikeVideo({ type: 'image/jpeg' }), false);
    assert.equal(looksLikeVideo({ type: 123 }), false);
    assert.equal(looksLikeVideo({}), false);
    assert.equal(looksLikeVideo(null), false);
    assert.equal(looksLikeVideo(undefined), false);
});

test('瀏覽器有 captureStream（或 Firefox 的 mozCaptureStream）才能用；沒有影片元件（例如 Node）不能用', () => {
    assert.equal(videoFileSupported(), false);
    try {
        globalThis.HTMLVideoElement = class {};
        assert.equal(videoFileSupported(), false, 'Safari：沒有 captureStream');
        HTMLVideoElement.prototype.captureStream = () => {};
        assert.equal(videoFileSupported(), true);
        globalThis.HTMLVideoElement = class {};
        HTMLVideoElement.prototype.mozCaptureStream = () => {};
        assert.equal(videoFileSupported(), true, 'Firefox');
    } finally {
        delete globalThis.HTMLVideoElement;
    }
});
