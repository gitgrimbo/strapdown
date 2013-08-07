// Why use Workers?
// Basically because of the poor performance of Firefox with the marked.js regexes.
// https://github.com/chjj/marked/issues/209
// By splitting up the XMP blocks we can parallelise the work across cores.

importScripts("marked.min.js");

self.addEventListener('message', function(e) {
    if ("parseContent" === e.data.cmd) {
        var m = marked(e.data.content);
        self.postMessage({
            marked: m,
            id: e.data.id
        });
    } else {
        self.postMessage("cmd " + e.data.cmd + " not understood");
    }
}, false);
