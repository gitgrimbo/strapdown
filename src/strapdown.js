;(function(window, document, strapdown) {
  strapdown.hasWorker = ("undefined" !== typeof Worker);
  strapdown.hasWhen = ("undefined" !== typeof when);
  strapdown.hasJQuery = ("undefined" !== typeof jQuery);
  strapdown.hasJQueryDeferred = (strapdown.hasJQuery && "undefined" !== typeof jQuery.Deferred);
  if ("undefined" === typeof strapdown.useWorkersIfAvailable) {
    strapdown.useWorkersIfAvailable = true;
  }

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
        this.pathToWorker = pathToWorker;
        this.workerPoolSize = 4;
        this.workersInUse = [];
        this.workersFree = [];
        this.workQueue = [];
    }

    WorkerHelper.prototype.onMessage = function(worker, deferred, e) {
        var M = "WorkerHelper.onMessage";
        console.log(M, "workersInUse", this.workersInUse.length);

        // Move this worker from used to free.
        for (var i = 0; i < this.workersInUse.length; i++) {
            //console.log(M, i, this.workersInUse[i], worker, this.workersInUse[i] === worker);
            if (this.workersInUse[i] === worker) {
                console.log(M, "Found worker at ", i);
                this.workersInUse.splice(i, 1);
                this.workersFree.push(worker);
                break;
            }
        }

        // Use setTimeout to make the resolve/reject the next item in the event loop.
        if ("string" === typeof e.data.marked) {
            console.log(M, "resolve");
            setTimeout(deferred.resolve.bind(deferred, e.data), 1);
        } else {
            console.log(M, "reject");
            setTimeout(deferred.reject.bind(deferred), 1);
        }

        // Pop off the next piece of work and process it.
        console.log(M, "workQueue", this.workQueue.length);
        if (this.workQueue.length > 0) {
            var work = this.workQueue.shift();
            this.generateMarkdown(work[0], work[1]);
        }
    };

    WorkerHelper.prototype.nextFreeWorker = function() {
        var M = "WorkerHelper.nextFreeWorker";
        var w = null;
        if (this.workersFree.length > 0) {
            console.log(M, "workersFree", this.workersFree.length);
            w = this.workersFree.shift();
            this.workersInUse.push(w);
            return w;
        } else if (this.workersInUse.length < this.workerPoolSize) {
            console.log(M, "workersInUse", this.workersInUse.length);
            w = new Worker(this.pathToWorker);
            this.workersInUse.push(w);
            return w;
        } else {
            console.log(M, "No free workers");
            return null;
        }
    };

    WorkerHelper.prototype.generateMarkdown = function(markdown, deferredAndPromise) {
        console.log("WorkerHelper.generateMarkdown");

        var w = this.nextFreeWorker();

        deferredAndPromise = deferredAndPromise || this.createDeferredAndPromise();

        if (null === w) {
            // Save the work, and return the promise which will be fulfilled later on.
            this.workQueue.push([markdown, deferredAndPromise]);
            return deferredAndPromise.promise;
        }

        w.onmessage = this.onMessage.bind(this, w, deferredAndPromise.deferred);
        w.postMessage({
            cmd: "parseContent",
            content: markdown,
            id: ""
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

  function finishedProcessingMarkdown() {
    prettify();
    styleTables();

    // All done - show body
    document.body.style.display = '';
    strapdown.onFinished && strapdown.onFinished();
  }

  function prettify() {
    // Prettify
    var codeEls = document.getElementsByTagName('code');
    for (var i=0, ii=codeEls.length; i<ii; i++) {
      var codeEl = codeEls[i];
      var lang = codeEl.className;
      if (!lang || lang.split(" ").indexOf("prettyprintignore") < 0) {
        codeEl.className = 'prettyprint lang-' + lang;
      }
   
    }
    prettyPrint();
  }

  function styleTables() {
    // Style tables
    var tableEls = document.getElementsByTagName('table');
    for (var i=0, ii=tableEls.length; i<ii; i++) {
      var tableEl = tableEls[i];
      tableEl.className = 'table table-striped table-bordered';
    }
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
      markdownEl.parentElement.replaceChild(newNode, markdownEl);

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
      if (strapdown.preprocessor) {
        markdown = strapdown.preprocessor.preprocess(markdown);
      }
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
      workerHelper.whenAll(results).then(finishedProcessingMarkdown);
    }
  }(markdownEls));

  if (!strapdown.async) {
    finishedProcessingMarkdown();
  }

  };

  if (false !== strapdown.processImmediately) {
    strapdown.process();
  }

})(window, document, window["strapdown"] || {});
