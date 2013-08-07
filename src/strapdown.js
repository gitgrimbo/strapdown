;(function(window, document, strapdown) {
  strapdown.hasWorker = ("undefined" !== typeof Worker);
  strapdown.hasWhen = ("undefined" !== typeof when);
  strapdown.hasJQuery = ("undefined" !== typeof jQuery);
  strapdown.hasJQueryDeferred = (strapdown.hasJQuery && "undefined" !== typeof jQuery.Deferred);

  // Must be relative to the PAGE URL, NOT THIS SCRIPT'S URL!
  strapdown.pathToWorker = strapdown.pathToWorker || "web-worker.js";

  // We need Worker and deferreds to use Workers effectively.
  strapdown.canUseWorkers = strapdown.hasWorker && (strapdown.hasWhen || strapdown.hasJQueryDeferred);

  strapdown.process = function() {

  // Hide body until we're done fiddling with the DOM
  document.body.style.display = 'none';

  //////////////////////////////////////////////////////////////////////
  //
  // Shims for IE < 9
  //

  document.head = document.getElementsByTagName('head')[0];

  if (!('getElementsByClassName' in document)) {
    document.getElementsByClassName = function(name) {
      function getElementsByClassName(node, classname) {
        var a = [];
        var re = new RegExp('(^| )'+classname+'( |$)');
        var els = node.getElementsByTagName("*");
        for(var i=0,j=els.length; i<j; i++)
            if(re.test(els[i].className))a.push(els[i]);
        return a;
      }
      return getElementsByClassName(document.body, name);
    }
  }

  var htmlCollectionToArray = (function () {
    function toArr(coll) {
      var arr = [],
          i,
          len = coll.length;
      for (i = 0; i < len; i++) {
        arr.push(coll[i]);
      }
      return arr;
    }
    return function (coll) {
      try {
        return Array.prototype.slice.call(coll, 0);
      } catch (e) {
        // E.g. IE8 fails using slice.
        // http://stackoverflow.com/a/2735133/319878
        return toArr(coll);
      }
    };
  }());

    // When using Workers
    function WorkerHelper(pathToWorker) {
      this.deferreds = {};
      this.pathToWorker = pathToWorker;
    }

    WorkerHelper.prototype.onMessage = function(e) {
        console.log("message", e, e.data);

        var deferreds = this.deferreds;

        var id = e.data.id;
        var deferred = deferreds[id];
        console.log(id, deferred);
        delete deferreds[id];

        if ("string" === typeof e.data.marked) {
            deferred.resolve(e.data);
        } else {
            deferred.reject();
        }
    };

    WorkerHelper.prototype.generateMarkdown = function(markdown) {
        var deferreds = this.deferreds;

        var idx = deferreds.idx || 0;
        var id = "d" + idx;
        deferreds.idx = (idx + 1);

        var deferredAndPromise = this.createDeferredAndPromise();
        deferreds[id] = deferredAndPromise.deferred;

        var w = new Worker(this.pathToWorker);
        w.onmessage = this.onMessage.bind(this);
        w.postMessage({
            cmd: "parseContent",
            content: markdown,
            id: id
        });
        return deferredAndPromise.promise;
    };

    // A "when all" wrapper for either when.js or jQuery.
    WorkerHelper.prototype.whenAll = function(deferreds) {
        if (strapdown.hasWhen) {
            return when.all(deferreds);
        } else {
            return jQuery.when.apply(jQuery, deferreds);
        }
    };

    // A deferred factory for either when.js or jQuery.
    WorkerHelper.prototype.createDeferredAndPromise = function() {
        var deferred = null,
            promise = null;
        if (strapdown.hasWhen) {
            deferred = when.defer();
            promise = deferred.promise;
        } else {
            deferred = jQuery.Deferred();
            promise = deferred.promise();
        }
        return {
            deferred: deferred,
            promise: promise
        };
    };

  //////////////////////////////////////////////////////////////////////
  //
  // Get user elements we need
  //
  var xmps = document.getElementsByTagName('xmp'),
      textareas = document.getElementsByTagName('textarea'),
      markdownEl = xmps[0] || textareas[0],
      titleEl = document.getElementsByTagName('title')[0],
      scriptEls = document.getElementsByTagName('script'),
      navbarEl = document.getElementsByClassName('navbar')[0],
      markdownEls = htmlCollectionToArray(xmps).concat(htmlCollectionToArray(textareas));

  //////////////////////////////////////////////////////////////////////
  //
  // <head> stuff
  //

  // Use <meta> viewport so that Bootstrap is actually responsive on mobile
  var metaEl = document.createElement('meta');
  metaEl.name = 'viewport';
  metaEl.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0';
  if (document.head.firstChild)
    document.head.insertBefore(metaEl, document.head.firstChild);
  else
    document.head.appendChild(metaEl);

  // Get origin of script
  var origin = '';
  for (var i = 0; i < scriptEls.length; i++) {
    if (scriptEls[i].src.match('strapdown')) {
      origin = scriptEls[i].src;
    }
  }
  var originBase = origin.substr(0, origin.lastIndexOf('/'));

  // Get theme
  var theme = markdownEl.getAttribute('theme') || 'bootstrap';
  theme = theme.toLowerCase();

  // Stylesheets
  var linkEl = document.createElement('link');
  linkEl.href = originBase + '/themes/'+theme+'.min.css';
  linkEl.rel = 'stylesheet';
  document.head.appendChild(linkEl);

  var linkEl = document.createElement('link');
  linkEl.href = originBase + '/strapdown.css';
  linkEl.rel = 'stylesheet';
  document.head.appendChild(linkEl);

  var linkEl = document.createElement('link');
  linkEl.href = originBase + '/themes/bootstrap-responsive.min.css';
  linkEl.rel = 'stylesheet';
  document.head.appendChild(linkEl);

  function onFinished() {
    console.log("finished all");
    // All done - show body
    document.body.style.display = '';
    strapdown.onFinished && strapdown.onFinished();
  }

  (function markdownAll(markdownEls) {
    var navbarAdded = false;

    function addNavbar(titleEl) {
      var newNode = document.createElement('div');
      newNode.className = 'navbar navbar-fixed-top';
      newNode.innerHTML = '<div class="navbar-inner"> <div class="container"> <div id="headline" class="brand"> </div> </div> </div>';
      document.body.insertBefore(newNode, document.body.firstChild);
      var title = titleEl.innerHTML;
      var headlineEl = document.getElementById('headline');
      if (headlineEl)
        headlineEl.innerHTML = title;
    }

    function generateMarkdown(markdown) {
        if (false === strapdown.useWorkersIfAvailable || !strapdown.canUseWorkers) {
            strapdown.async = false;
            return marked(markdown);
        } else {
            strapdown.async = true;
            return workerHelper.generateMarkdown(markdown);
        }
    }

    function markdownIt(markdownEls, i) {
      //////////////////////////////////////////////////////////////////////
      //
      // <body> stuff
      //

      var markdownEl = markdownEls[i];
      var markdown = markdownEl.textContent || markdownEl.innerText;

      // Keep existing id if present
      var id = markdownEl.id || ('content' + i);

      var newNode = document.createElement('div');
      newNode.className = 'container';
      newNode.id = id;
      document.body.replaceChild(newNode, markdownEl);

      // Insert navbar if there's none
      if (!navbarEl && titleEl && !navbarAdded) {
        addNavbar(titleEl);
        navbarAdded = true;
      }

      //////////////////////////////////////////////////////////////////////
      //
      // Markdown!
      //

      // Generate Markdown
      var html = generateMarkdown(markdown);
      if (html.then) {
        html.then(function(data) {
          console.log("finished item", i, "of", markdownEls.length);
          newNode.innerHTML = data.marked;
        });
      } else {
        newNode.innerHTML = html;
      }
      return html;
    }

    var results = [];
    var workerHelper = new WorkerHelper(strapdown.pathToWorker);

    for (var i = 0; i < markdownEls.length; i++) {
      if (markdownEls[i].className.split(" ").indexOf("strapdown-ignore") < 0) {
        results.push(markdownIt(markdownEls, i));
      }
    }
    if (results[0].then) {
      // Existence of results[0].then signifies we using deferreds.
      // Both when.js's when.all() and jQuery's jQuery.when() return an object with a then() method.
      workerHelper.whenAll(results).then(onFinished);
    }
  }(markdownEls));

  // Prettify
  var codeEls = document.getElementsByTagName('code');
  for (var i=0, ii=codeEls.length; i<ii; i++) {
    var codeEl = codeEls[i];
    var lang = codeEl.className;
    codeEl.className = 'prettyprint lang-' + lang;
  }
  prettyPrint();

  // Style tables
  var tableEls = document.getElementsByTagName('table');
  for (var i=0, ii=tableEls.length; i<ii; i++) {
    var tableEl = tableEls[i];
    tableEl.className = 'table table-striped table-bordered';
  }

  if (!strapdown.async) {
    onFinished();
  }

  };

  if (false !== strapdown.processImmediately) {
    strapdown.process();
  }

})(window, document, window["strapdown"] || {});
