var inNode = (typeof(process) !== 'undefined' && process.versions && process.versions.node);

var pathPrefix = inNode ? "./" : "/javascripts/";
var WebWorker = inNode ? require('webworker-threads').Worker : Worker;
var _ = require('underscore');

var WorkerPool = module.exports = function(filename, max) {
  var pool = this;
  this.jobId = 0;
  this.filename = filename;
  this.workerCount = 0;
  this.callbacks = {};
  this.queue = [];
  this.max = max;
  console.time("creating worker")
  this.path = pathPrefix + filename;
  this.workers = _(max).times(function() {
    var worker = new WebWorker(pool.path);
    worker.onmessage = function(result) {
      var callback = pool.callbacks[result.data.id];
      delete pool.callbacks[result.data.id];
      callback(result);
      pool.workers.push(worker);
      pool.doWork();
    };
    return worker;
  });
  console.timeEnd("creating worker")
};

WorkerPool.prototype.addJob = function(payload, callback) {
  payload.msg.id = this.jobId;
  this.callbacks[payload.msg.id] = callback;
  this.queue.push(payload);
  console.log(this.filename+ ":queue depth is "+this.queue.length)
  this.jobId++;
  this.doWork();
};

WorkerPool.prototype.doWork = function() {
  if (this.workers.length != 0 && this.queue.length != 0) {
    var pool = this;
    var unit = this.queue.shift();
    console.log(this.filename+":doing work... at "+pool.workerCount+" workers");
    unit.msg.source = unit.msg.id;
    console.log("posting message "+unit.msg.id+" to "+this.path);
    var worker = this.workers.shift();
    worker.postMessage(unit.msg, unit.transfer);
  } else {
    if (this.queue.length == 0) {
      console.log("no work to do");
    } else {
      console.log("not enough workers");
    }

  }
}
