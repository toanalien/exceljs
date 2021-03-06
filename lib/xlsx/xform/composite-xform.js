/**
 * Copyright (c) 2016-2017 Guyon Roche
 * LICENCE: MIT - please refer to LICENCE file included with this module
 * or https://github.com/guyonroche/exceljs/blob/master/LICENSE
 */

'use strict';

var utils = require('../../utils/utils');
var BaseXform = require('./base-xform');

var CompositeXform = module.exports = function(options) {
  this.tag = options.tag;
  this.attrs = options.attrs;
  this.children = options.children;
  this.map = this.children.reduce(function(map, child) {
    var name = child.name || child.tag;
    var tag = child.tag || child.name;
    map[tag] = child;
    child.name = name;
    child.tag = tag;
    return map;
  }, {});
};

utils.inherits(CompositeXform, BaseXform, {
  prepare: function(model, options) {
    this.children.forEach(function (child) {
      child.xform.prepare(model[child.tag], options);
    });
  },
  
  render: function(xmlStream, model) {
    xmlStream.openNode(this.tag, this.attrs);
    this.children.forEach(function (child) {
      child.xform.render(xmlStream, model[child.name]);
    });
    xmlStream.closeNode();
  },

  parseOpen: function(node) {
    if (this.parser) {
      this.parser.xform.parseOpen(node);
      return true;
    } else {
      switch(node.name) {
        case this.tag:
          this.model = {};
          return true;
        default:
          this.parser = this.map[node.name];
          if (this.parser) {
            this.parser.xform.parseOpen(node);
            return true;
          }
      }
      return false;
    }
  },
  parseText: function(text) {
    if (this.parser) {
      this.parser.xform.parseText(text);
    }
  },
  parseClose: function(name) {
    if (this.parser) {
      if (!this.parser.xform.parseClose(name)) {
        this.model[this.parser.name] = this.parser.xform.model;
        this.parser = undefined;
      }
      return true;
    } else {
      return false;
    }
  },
  reconcile: function(model, options) {
    this.children.forEach(function (child) {
      child.xform.prepare(model[child.tag], options);
    });
  }
});
