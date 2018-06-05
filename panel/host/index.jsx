//
// UTILITY FUNCTIONS
////////////////////////////////////////////////////////////////////////////////

/**
 * Returns a string with double quotes escaped (" --> \")
 *
 * @param {string} str the string to escape
 * @returns {string} the escaped string (double quotes are prefixed with an escape)
 */
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

/**
 * Given an array, return an array of the applications of `fn` to each item in
 * the array.
 *
 * @example
 * map([1, 2, 3], function(x) { return x * 2 }) --> [2, 4, 6]
 *
 * @param {Array} arr Array to map over
 * @param {Function} fn mapping function. Signature is (item, index, array)
 * @returns {Array} the result of applying `fn` to each item in `arr`
 */
function map(arr, fn) {
    var newArr = [];
    for (var i = 0; i < arr.length; i++) {
        newArr.push(fn(arr[i], i, arr));
    }
    return newArr;
}


/**
 * For each item in `arr`, calls `fn`. Essentially the same thing as using a
 * `for` loop to iterate over the array.
 *
 * @param {Array} arr the array over which to iterate
 * @param {Function} fn the function to call for each item. Signature is
 *     (item, index, array).
 */
function forEach(arr, fn) {
    map(arr, fn);
}


/**
 * Reduces an array (`arr`) to a single value by iterating over each item. `fn`
 * is called for each item and is passed the current accumulation from previous
 * calls and the current item in the array.
 *
 * @param {Array} arr the array to reduce
 * @param {Function} fn the reducing function. Signature is (acc, item, index, array)
 * @param {*} initialState the initial state to pass to the reducing function
 * @returns {*}
 */
function reduce(arr, fn, initialState) {
    var acc = initialState;
    for (var i = 0; i < arr.length; i++) {
        acc = fn(acc, arr[i], i, arr);
    }
    return acc;
}

/**
 * Find the last item in an array that matches the criteria defined by `fn`.
 * When `fn` evaluates to a truthy value, that item will be marked for
 * return. If multiple items pass the conditional check, the last item is the
 * one returned.
 *
 * @param {Array} arr The array to search
 * @param {Function} fn The criteria function. Signature is (item, index, array)
 * @returns {*} The item that was found or `undefined` if no item was found
 */
function find(arr, fn) {
    return reduce(arr, function(prev, cur, idx, arr) {
        if (fn(cur, idx, arr)) {
            prev = cur;
        }
        return prev;
    }, undefined);
}

/**
 * Return a new array baed on `arr` where each item in the new array satisfies
 * the conditions set in `fn`.
 *
 * @param {Array} arr The array to filter
 * @param {Function} fn the filtering method. Signature is (item, index, array)
 *    returning a truthy value will keep the item in the new array
 *    returning a falsy value will eliminate the item from the new array
 * @returns {Array} The filtered array
 */
function filter(arr, fn) {
    var newArr = [];
    forEach(arr, function(item, idx, arr) {
        if (fn(item, idx, arr)) {
            newArr.push(item);
        }
    });
    return newArr;
}

/**
 * Convert an array into a string that is parsable by JSON.parse.
 *
 * @param {Array} arr the array to convert
 * @returns {string} the string representation of the array
 */
function arrayToString(arr) {
    var str = "[" + map(arr, function(item) {
        if (typeof item === 'string') return '"' + escape(item) + '"';
        if (item instanceof Array) return arrayToString(item);
        return item;
    }) + "]";
    return str;
}

/**
 * De-duplicate an array
 *
 * @param {Array} arr the array to de-duplicate
 * @returns {Array} deduplicated array
 */
function dedup(arr) {
    return reduce(arr, function(acc, item) {
        if (!find(acc, function(candidate) { return candidate === item; })) {
            acc.push(item);
        }
        return acc;
    }, []);
}

//
// PHOTOSHOP-SPECIFIC UTILITY FUNCTIONS
////////////////////////////////////////////////////////////////////////////////

/**
 * Find the layer (starting at `root`) that has the supplied id. If `root` isn't
 * specified, defaults to the currently active document.
 *
 * @param {number} id
 * @param {*} [root = app.activeDocument] the starting point for the search
 * @returns {*} the layer, or `undefined` if no layer matches the id
 */
function getLayerWithId(id, root) {
    if (!root) { root = app.activeDocument; }

    function fn(acc, item) {
        var temp;

        // check if the item passed in matches the id -- if so, we're done
        if (item.id === id) { temp = item; }

        // if the item is actually an array, find the item matching the id in the array
        if (!temp && item.length > 0) { temp = reduce(item, fn, undefined); }

        // if the item has art layers, search those
        if (!temp && item.artLayers) { temp = reduce(item.artLayers, fn, undefined); }

        // if the item has layer sets, search those too
        if (!temp && item.layerSets) { temp = reduce(item.layerSets, fn, undefined); }

        // if the item has layers, search those
        if (!temp && item.layers) { temp = reduce(item.layers, fn, undefined); }

        // if found, make the item our return
        if (temp) { acc = temp; }
        return acc;
    };

    return fn(undefined, root);
}

/**
 * Given an id, find the layer with said id, and if it's a text layer, update
 * the layer with the text.
 *
 * @param {number} id the id of layer to update
 * @param {string} text the text to apply
 */
function updateTextLayerWithId(id, text) {
    var layer = getLayerWithId(id);
    if (layer) {
        if (layer.kind === LayerKind.TEXT) {
            layer.textItem.contents = text;
        }
    }
}


/**
 * Return a flattened array of layers starting at `whichLayer`. Considers layers,
 * artLayers, and layerSets. The end result will be an array of _only_ layers
 * (not artLayers or layerSets). Note: there may be duplicates!
 *
 * @param {*} whichLayer starting point
 * @returns {Array} of layers
 */
function getLayers(whichLayer) {
    var activeLayer = whichLayer;
    var layers = [];
    var layerStack = [];

    if (!activeLayer.layers && !activeLayer.artLayers && !activeLayer.layerSets) {
        // If we have no layers, artLayers, or layerSets, we're probably a layer
        layers.push(activeLayer);
    } else {
        // create a stack that we can process. The idea here is to pop items off
        // the stack and see if they are a layer or something that contians
        // layers. If the former, we add them to the layers array. If the latter
        // we push each item inside the collection onto the stack/ We continue
        // until the stack is empty.
        layerStack.push(activeLayer);
        while(layerStack.length > 0) {
            activeLayer = layerStack.pop();
            if (!activeLayer.layers && !activeLayer.artLayers && !activeLayer.layerSets) {
                // we're a layer!
                layers.push(activeLayer);
            } else {
                // push the items in any collections onto the stack
                forEach(activeLayer.layers || [], function(item) { layerStack.push(item); });
                forEach(activeLayer.artLayers || [], function(item) { layerStack.push(item); });
                forEach(activeLayer.layerSets || [], function(item) { layerStack.push(item); });
            }
        }
    }

    return layers;
}

/**
 * Get the currently selected layers. Returns layers in a group if that group is
 * currently selected. Will likely contain duplicates.
 *
 * @returns {Array} of layers
 */
function getSelectedLayers() {
    return getLayers(app.activeDocument.activeLayer);
}

/**
 * Get all layers in the document. Will likely contain duplicates.
 *
 * @returns {Array} of layers.
 */
function getAllLayers() {
    return getLayers(app.activeDocument);
}

/**
 * Create a new text layer in the active document with the supplied
 * text and name
 *
 * @param {string} text
 * @param {string} name
 */
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

/**
 * Returns `true` if the layer provifded is a text layer
 *
 * @param {Layer} item
 * @returns {boolean} if item is a text layer, returns `true`
 */
function isTextLayer(item) {
    return item && item.kind === LayerKind.TEXT;
}

/**
 * Returns an array containing the Ids of all the selected layers matching `fn`'s critera
 *
 * @param {*} fn
 * @returns {Array} of selected layers matching `fn` criteria
 */
function getAllSelectedLayerIds(fn) {
    return map(filter(dedup(getSelectedLayers()), fn), function(item) { return item.id; });
}

/**
 * Returns an array containing the Ids of all the layers in the document matching
 * `fn`'s criteria
 *
 * @param {*} fn
 * @returns {Array} of layers matching `fn`'s criteria
 */
function getAllLayerIds(fn) {
    return map(filter(dedup(getAllLayers()), fn), function(item) { return item.id; });
}

/**
 * Return an array that contains the IDs and names of all the text layers. The
 * return result looks like this:
 *
 * [
 *     [ id, layer-name ],
 *     [ id, layer-name ], ...
 * ]
 *
 * @param {*} mode if `all`, return all layers, otherwise return selected layers
 * @returns {Array}
 */
function getTextLayerIdsAndNames(mode) {
    return arrayToString(map((mode === 'all' ? getAllLayerIds : getAllSelectedLayerIds)(isTextLayer), function(id) {
        var layer = getLayerWithId(id);
        return [ id, layer.name ];
        }));
}