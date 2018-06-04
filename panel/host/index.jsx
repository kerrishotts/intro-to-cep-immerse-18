function identity() {
    return true;
}

function escape(str) {
    newStr = "";
    for (var i = 0; i < str.length; i++) {
        if (str[i] === '"') {
            newStr += '\\"';
        } else {
            newStr += str[i];
        }
    }
    return newStr;
}

function map(arr, fn) {
    var newArr = [];
    for (var i = 0; i < arr.length; i++) {
        newArr.push(fn(arr[i], i, arr));
    }
    return newArr;
}

function forEach(arr, fn) {
    map(arr, fn);
}

function reduce(arr, fn, initialState) {
    var acc = initialState;
    for (var i = 0; i < arr.length; i++) {
        acc = fn(acc, arr[i], i, arr);
    }
    return acc;
}

function find(arr, fn) {
    return reduce(arr, function(prev, cur, idx, arr) {
        if (fn(cur, idx, arr)) {
            prev = cur;
        }
        return prev;
    }, undefined);
}

function filter(arr, fn) {
    var newArr = [];
    forEach(arr, function(item, idx, arr) {
        if (fn(item, idx, arr)) {
            newArr.push(item);
        }
    });
    return newArr;
}

function arrayToString(arr) {
    var str = "[" + map(arr, function(item) {
        if (typeof item === 'string') return '"' + escape(item) + '"';
        if (item instanceof Array) return arrayToString(item);
        return item;
    }) + "]";
    return str;
}

function getLayerWithId(id, root) {
    var temp, layer;
    if (!root) {
        root = app.activeDocument;
    }

    function fn(acc, item) {
        var temp;
        if (item.id === id) {
            temp = item;
        } else if (item.length > 0) {
            temp = reduce(item, fn, acc);
        }
        if (item.artLayers) {
            temp = reduce(item.artLayers, fn, undefined);
        }
        if (item.layerSets) {
            temp = reduce(item.layerSets, fn, undefined);
        }
        if (item.layers) {
            temp = reduce(item.layers, fn, undefined);
        }
        if (temp) {
            acc = temp;
        }
        return acc;
    };

    return fn(undefined, root);
}

function updateTextLayerWithId(id, text) {
    var layer = getLayerWithId(id);
    if (layer) {
        if (layer.kind === LayerKind.TEXT) {
            layer.textItem.contents = text;
        }
    }
}

function getLayers(whichLayer) {
    var activeLayer = whichLayer;
    var layers = [], layerStack = [], i;

    if (!activeLayer.layers && !activeLayer.artLayers && !activeLayer.layerSets) {
        layers.push(activeLayer);
    } else {
        layerStack.push(activeLayer);
        while(layerStack.length > 0) {
            activeLayer = layerStack.pop();
            if (!activeLayer.layers && !activeLayer.artLayers && !activeLayer.layerSets) {
                layers.push(activeLayer);
            } else {
                forEach(activeLayer.layers || [], function(item) { layerStack.push(item); });
                forEach(activeLayer.artLayers || [], function(item) { layerStack.push(item); });
                forEach(activeLayer.LayerSets || [], function(item) { layerStack.push(item); });
            }
        }
    }

    return layers;
}

function getSelectedLayers() {
    return getLayers(app.activeDocument.activeLayer);
}

function getAllLayers() {
    return getLayers(app.activeDocument);
}

function dedup(arr) {
    var newArr = [];
    forEach(arr, function(item) {
        if (!find(newArr, function(candidate) { return candidate === item; })) {
            newArr.push(item);
        }
    });
    return newArr;
}


function addTextLayer(text, name) {
    var layers = app.activeDocument.artLayers;
    var layer = layers.add();
    layer.kind = LayerKind.TEXT;
    layer.name = name;

    var textItem = layer.textItem;
    textItem.kind = TextType.PARAGRAPHTEXT;
    textItem.size = 24;
    textItem.position = [10, 10];
    textItem.contents = text;
    textItem.width = new UnitValue('200 pixels');
    textItem.height = new UnitValue('50 pixels');
}

function isTextLayer(item) {
    return item && item.kind === LayerKind.TEXT;
}

function getAllSelectedLayerIds(fn) {
    return map(filter(dedup(getSelectedLayers()), fn), function(item) { return item.id; });
}

function getAllLayerIds(fn) {
    return map(filter(dedup(getAllLayers()), fn), function(item) { return item.id; });
}

/*
arrayToString(map(getAllLayerIds(isTextLayer), function(id) {
    var layer = getLayerWithId(id);
    return [ id, layer.name ];
    }));
*/