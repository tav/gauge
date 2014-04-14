// Public Domain (-) 2014 The Gauge Authors.
// See the Gauge UNLICENSE file for details.

(function() {

  var root = this;
  var isNode = (typeof module !== 'undefined' && module.exports);

  var clock;

  if (isNode) {
    var hrtime = process.hrtime;
    clock = function() {
      var time = hrtime();
      return ((time[0] * 1e9) + time[1])|0;
    };
  } else {
    var perf = root.performance;
    if (perf && perf.now) {
      clock = function() {
        return (perf.now() * 1e6)|0;
      };
    } else {
      var now = Date.now;
      var latest = now();
      var skew = 0;
      clock = function() {
        var v = now();
        if (v < latest) {
          skew += latest - v + 1;
        }
        latest = v;
        return ((v + skew) * 1e6)|0;
      };
    }
  }

  var roundDown10 = function(n) {
    var result = 1,
        tens = 0;
    n = n|0;
    while (n >= 10) {
      n = (n / 10)|0;
      tens++;
    }
    for (var i = 0; i < tens; i++) {
      result *= 10;
    }
    return result;
  };

  var roundUp = function(n) {
    var base = roundDown10(n), prospect;
    if (n <= base) {
        return base;
    }
    if (n <= prospect = (2 * base)) {
        return prospect
    }
    if (n <= prospect = (5 * base)) {
        return prospect
    }
    return 10 * base;
  };

  var queue = [];

  var defaultCallback = function(results) {
    results.forEach(function(result) {
      console.log(result);
    });
  };

  var gauge = function(tests) {
    Object.keys(tests).forEach(function(key) {
      var fn = tests[key];
      queue.push({
        auto: fn.length == 0,
        failed: false,
        fn: fn,
        n: 0,
        name: key,
        started: false,
      });
    });
  };

  gauge.run = function(opts, callback) {
    if (opts === undefined) {
      opts = {};
    }
    g = new Gauge(opts, callback);
    g.run();
  };

  var Gauge = function(opts, callback) {
    var g = {
      bytes: 0,
      callback: callback || defaultCallback,
      duration: ((opts.duration || 1000) * 1e6)|0,
      elapsed: 0,
      idx: 0,
      running: false,
      start: 0,
      timeout: opts.timeout || 3000,
      tests: queue,
    };
    queue = [];
  }

  Gauge.prototype = {

    cost: function() {
      if (this.N <= 0) {
        return 0;
      }
      return this.elapsed / this.N;
    },

    resetTimer: function() {
      if (this.running) {
        this.start = clock();
      }
      this.elapsed = 0;
      this.bytes = 0;
    },

    run: function() {

      var n = 1;
      this.runN(n);
      while (!this.failed && this.elapsed < this.duration && n < 1e9) {
        n = Math.max(Math.min(n+((n/2)|0), 100*last), last+1);
        n = roundUp(n);
        this.runN(n);
      }
    },

    runN: function(n) {
      // gc()
      this.N = n;
      this.resetTimer();
      this.startTimer();
      for (var i = 0; i < n; i++) {

      }
      this.stopTimer();
    },

    setBytes: function(n) {
      this.bytes = n;
    },

    startTimer: function() {
      if (!this.running) {
        this.running = true;
        this.start = clock();
      }
    },

    stopTimer: function() {
      if (this.running) {
        this.running = false;
        this.elapsed += clock() - g.start;
      }
    },

  }

  root.gauge = gauge;
  if (isNode) {
     module.exports = gauge;
  }

})();
