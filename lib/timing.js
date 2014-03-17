module.exports = {
  timings: {},
  time: function(label) {
    if (this.timings[label]) throw "Already defined: "+label;
    this.timings[label] = new Date().getTime();
  },
  timeEnd: function(label) {
    if (!this.timings[label]) throw "Not defined: "+label;
    var now = new Date().getTime();
    console.log(label+": "+((now - this.timings[label]) / 1000));
    delete this.timings[label];
  }
}