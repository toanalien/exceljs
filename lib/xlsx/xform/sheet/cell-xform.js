/**
 * Copyright (c) 2015 Guyon Roche
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 */

'use strict';

var utils = require('../../../utils/utils');
var BaseXform = require('../base-xform');

var Enums = require('../../../doc/enums');
var RelType = require('../../rel-type');
var Range = require('../../../doc/range');


function getValueType(v) {
  if ((v === null) || (v === undefined)) {
    return Enums.ValueType.Null;
  } else if ((v instanceof String) || (typeof v === 'string')) {
    return Enums.ValueType.String;
  } else if (typeof v === 'number') {
    return Enums.ValueType.Number;
  } else if (typeof v === 'boolean') {
    return Enums.ValueType.Boolean;
  } else if (v instanceof Date) {
    return Enums.ValueType.Date;
  } else if (v.text && v.hyperlink) {
    return Enums.ValueType.Hyperlink;
  } else if (v.formula) {
    return Enums.ValueType.Formula;
  } else if (v.SharedFormula) {
    return Enums.ValueType.SharedFormula;
  } else if (v.error) {
    return Enums.ValueType.Error;
  } else {
    throw new Error('I could not understand type of value');
  }
}

function getEffectiveCellType(cell) {
  switch (cell.type) {
    case Enums.ValueType.Formula:
      return getValueType(cell.result);
    default:
      return cell.type;
  }
}


var CellXform = module.exports = function() {
};

utils.inherits(CellXform, BaseXform, {

  get tag() { return 'c'; },

  prepare: function(model, options) {
    var styleId = options.styles.addStyleModel(model.style || {}, getEffectiveCellType(model));
    if (styleId) {
      model.styleId = styleId;
    }

    switch (model.type) {
      case Enums.ValueType.String:
        if (options.sharedStrings) {
          model.ssId = options.sharedStrings.add(model.value);
        }
        break;
      case Enums.ValueType.Date:
        if (options.date1904) {
          model.date1904 = true;
        }
        break;
      case Enums.ValueType.Hyperlink:
        if (options.sharedStrings) {
          model.ssId = options.sharedStrings.add(model.text);
        }
        var hyperlinkId = options.hyperlinks.length + 1;
        options.hyperlinks.push({
          address: model.address,
          rId: 'rId' + hyperlinkId,
          type: RelType.Hyperlink,
          target: model.hyperlink,
          targetMode: 'External'
        });
        break;
      case Enums.ValueType.Merge:
        options.merges.add(model);
        break;
      case Enums.ValueType.Formula:
        if (options.date1904) {
          // in case valueType is date
          model.date1904 = true;
        }
        if (model.formula) {
          options.formulae[model.address] = model;
        } else if (model.sharedFormula) {
          const master = options.formulae[model.sharedFormula];
          if (!master) {
            throw new Error('Shared Formula master must exist above and or left of clone');
          }
          if (master.si !== undefined) {
            model.si = master.si;
            master.ref.expandToAddress(model.address);
          } else {
            model.si = master.si = options.siFormulae++;
            master.ref = new Range(master.address, model.address);
          }
        }
        break
      default:
        break;
    }
  },

  renderFormula: function(xmlStream, model) {
    var attrs = null;
    if (model.ref) {
      attrs = {
        t: 'shared',
        ref: model.ref.range,
        si: model.si,
      };
    } else if (model.si !== undefined) {
      attrs = {
        t: 'shared',
        si: model.si,
      };
    }
    switch (getValueType(model.result)) {
      case Enums.ValueType.Null: // ?
        xmlStream.leafNode('f', attrs, model.formula);
        break;
      case Enums.ValueType.String:
        // oddly, formula results don't ever use shared strings
        xmlStream.addAttribute('t', 'str');
        xmlStream.leafNode('f', attrs, model.formula);
        xmlStream.leafNode('v', null, model.result);
        break;
      case Enums.ValueType.Number:
        xmlStream.leafNode('f', attrs, model.formula);
        xmlStream.leafNode('v', null, model.result);
        break;
      case Enums.ValueType.Boolean:
        xmlStream.addAttribute('t', 'b');
        xmlStream.leafNode('f', attrs, model.formula);
        xmlStream.leafNode('v', null, model.result ? 1 :  0);
        break;
      case Enums.ValueType.Error:
        xmlStream.addAttribute('t', 'e');
        xmlStream.leafNode('f', attrs, model.formula);
        xmlStream.leafNode('v', null, model.result.error);
        break;
      case Enums.ValueType.Date:
        xmlStream.leafNode('f', attrs, model.formula);
        xmlStream.leafNode('v', null, utils.dateToExcel(model.result, model.date1904));
        break;
      // case Enums.ValueType.Hyperlink: // ??
      // case Enums.ValueType.Formula:
      default:
        throw new Error('I could not understand type of value');
    }
  },

  render: function(xmlStream, model) {
    if ((model.type === Enums.ValueType.Null) && !model.styleId) {
      // if null and no style, exit
      return;
    }

    xmlStream.openNode('c');
    xmlStream.addAttribute('r', model.address);

    if (model.styleId) {
      xmlStream.addAttribute('s', model.styleId);
    }

    switch (model.type) {
      case Enums.ValueType.Null:
        break;

      case Enums.ValueType.Number:
        xmlStream.leafNode('v', null, model.value);
        break;

      case Enums.ValueType.Boolean:
        xmlStream.addAttribute('t', 'b');
        xmlStream.leafNode('v', null, model.value ? '1' : '0');
        break;

      case Enums.ValueType.Error:
        xmlStream.addAttribute('t', 'e');
        xmlStream.leafNode('v', null, model.value.error);
        break;

      case Enums.ValueType.String:
        if (model.ssId !== undefined) {
          xmlStream.addAttribute('t', 's');
          xmlStream.leafNode('v', null, model.ssId);
        } else {
          xmlStream.addAttribute('t', 'str');
          xmlStream.leafNode('v', null, model.value);
        }
        break;

      case Enums.ValueType.Date:
        xmlStream.leafNode('v', null, utils.dateToExcel(model.value, model.date1904));
        break;

      case Enums.ValueType.Hyperlink:
        if (model.ssId !== undefined) {
          xmlStream.addAttribute('t', 's');
          xmlStream.leafNode('v', null, model.ssId);
        } else {
          xmlStream.addAttribute('t', 'str');
          xmlStream.leafNode('v', null, model.text);
        }
        break;

      case Enums.ValueType.Formula:
        this.renderFormula(xmlStream, model);
        break;

      case Enums.ValueType.Merge:
        // nothing to add
        break;

      default:
        break;
    }

    xmlStream.closeNode(); // </c>
  },
  
  parseOpen: function(node) {
    switch(node.name) {
      case 'c':
        // var address = colCache.decodeAddress(node.attributes.r);
        var model = this.model = {
          address: node.attributes.r
        };
        this.t = node.attributes.t;
        if (node.attributes.s) {
          model.styleId = parseInt(node.attributes.s, 0);
        }
        return true;

      case 'f':
        this.currentNode = 'f';
        this.model.si = node.attributes.si;
        if (node.attributes.t === 'shared') {
          this.model.sharedFormula = true;
        }
        this.model.ref = node.attributes.ref;
        return true;

      case 'v':
        this.currentNode = 'v';
        return true;

      default:
        return false;
    }
  },
  parseText: function(text) {
    switch (this.currentNode) {
      case 'f':
        this.model.formula = this.model.formula ? this.model.formula + text : text;
        break;
      case 'v':
        this.model.value = this.model.value ? this.model.value + text : text;
        break;
      default:
        break;
    }
  },
  parseClose: function(name) {
    switch(name) {
      case 'c':
        var model = this.model;

        // first guess on cell type
        if (model.formula || model.sharedFormula) {
          model.type = Enums.ValueType.Formula;
          if (model.value) {
            if (this.t === 'str') {
              model.result = utils.xmlDecode(model.value);
            } else if (this.t === 'b') {
              model.result = parseInt(model.value, 10) !== 0;
            } else if (this.t === 'e') {
              model.result = { error: model.value };
            } else {
              model.result = parseFloat(model.value);
            }
            model.value = undefined;
          }
        } else if (model.value !== undefined) {
          switch (this.t) {
            case 's':
              model.type = Enums.ValueType.String;
              model.value = parseInt(model.value, 10);
              break;
            case 'str':
              model.type = Enums.ValueType.String;
              model.value = utils.xmlDecode(model.value);
              break;
            case 'b':
              model.type = Enums.ValueType.Boolean;
              model.value = parseInt(model.value, 10) !== 0;
              break;
            case 'e':
              model.type = Enums.ValueType.Error;
              model.value = { error: model.value };
              break;
            default:
              model.type = Enums.ValueType.Number;
              model.value = parseFloat(model.value);
              break;
          }
        } else if (model.styleId) {
          model.type = Enums.ValueType.Null;
        } else {
          model.type = Enums.ValueType.Merge;
        }
        return false;
      case 'f':
      case 'v':
        this.currentNode = undefined;
        return true;
      default:
        return false;
    }
  },

  reconcile: function(model, options) {
    var style = model.styleId && options.styles.getStyleModel(model.styleId);
    if (style) {
      model.style = style;
    }
    if (model.styleId !== undefined) {
      model.styleId = undefined;
    }

    switch (model.type) {
      case Enums.ValueType.String:
        if (typeof model.value === 'number') {
          model.value = options.sharedStrings.getString(model.value);
        }
        if (model.value.richText) {
          model.type = Enums.ValueType.RichText;
        }
        break;
      case Enums.ValueType.Number:
        if (style && utils.isDateFmt(style.numFmt)) {
          model.type = Enums.ValueType.Date;
          model.value = utils.excelToDate(model.value, options.date1904);
        }
        break;
      case Enums.ValueType.Formula:
        if ((model.result !== undefined) && style && utils.isDateFmt(style.numFmt)) {
          model.result = utils.excelToDate(model.result, options.date1904);
        }
        if (model.sharedFormula) {
          if (model.formula) {
            options.formulae[model.si] = model;
            delete model.sharedFormula;
          } else {
            model.sharedFormula = options.formulae[model.si].address;
          }
          delete model.si;
        }
        break;
      default:
        break;
    }
    
    // look for hyperlink
    var hyperlink = options.hyperlinkMap.getHyperlink(model.address);
    if (hyperlink) {
      model.type = Enums.ValueType.Hyperlink;
      model.text = model.value;
      model.value = undefined;
      model.hyperlink = hyperlink;
    }
  }
});
