/*

Goals: 

1. Keep a FIFO queue of requested calls
2. Enforce a max number of calls being executed concurrently within the entire thread
3. If the concurrency limit is raised, immediately run more operations
4. Provide flexible callback options (curry into callback, pass-through arguments)

API:

var ch = require( 'ch' ).ch;

ch.setMax( [category] , amount );
ch.getMax( [category] );
ch.onDrain( [category] , callback ); // callback( category )
ch.getRunning( [category] );
ch.getFree( [category] );

ch.setDefaultCategory( category );
ch.setCategoryDefaults({
    amount: 1,
    curryRelease: true,
    debug: false,
    arguments: null,
    onDrain: null,
});

release = ch.queue({
    callback: function,
    [curryRelease: boolean],
    [arguments: array],
    [category: category],
    [amount: number],
    [debug: boolean],
    [unshift: boolean],
    });

release();
console.log( release.debug ); // Only if debug was set true

*/

var globalRunCount = 0;
var categoryRunCount = {};
var queues = {};
var max = {};
var consumed = {};
var defaultCategory = null;
var defaults = {};
var createCategory;
var next;
var duplicateDebugData;

// Return a normalized category, and create it if it doesn't exist
createCategory = function( category ) {
    // If no category was specified
    if( undefined === category ) {
        // And the default hasn't yet been set
        if( null === defaultCategory ) {
            // Use an empty string as the default
            defaultCategory = '';
        }

        // Set the current category to the default
        category = defaultCategory;
    }

    // Convert the category to a string (in case of any other object type)
    category = String( category );

    // Initialize the category if needed
    if( ! defaults[ category ] ) {
        queues[ category ] = [];
        categoryRunCount[ category ] = 0;
        max[ category ] = 1;
        consumed[ category ] = 0;
        defaults[ category ] = {
            amount: 1,
            curryRelease: true,
            debug: false,
            arguments: null,
            unshift: false,
            onDrain: null,
        };
    }

    // If the default category hasn't been selected, then the first category
    // used/referenced is the default from there on out
    if( null === defaultCategory ) {
        defaultCategory = category;
    }

    // Return our initialized category
    return category;
};

// Meat and potatoes - run more off the queue if possible
next = function( category ) {
    var nextItem;
    var args;

    // If there's nothing to run from the queue, easy exit
    if( !queues[ category ].length ) {
        if( !consumed[ category ] && 'function' === typeof defaults[ category ].onDrain ) {
            defaults[ category ].onDrain( category );
        }

        return;
    }

    nextItem = queues[ category ][ 0 ];

    // If the category has a limit and the next item on the queue would put us
    // over the limit, exit
    if( consumed[ category ] + nextItem.amount > max[ category ] ) {
        if( nextItem.amount > max[ category ] ) {
            throw 'concurrency-handler.setMax(): next: RUNTIME ERROR: ' + category + ' item with amount ' + nextItem.amount + ' exceeds maximum resources of ' + max[ category ];
        }

        return;
    }

    // Remove from the queue because we've committed to it now
    queues[ category ].shift();
    nextItem.inQueue = false;

    // Add its amount to the total
    consumed[ category ] += nextItem.amount;

    // Build the arguments list, optionally currying the release method
    args = nextItem.arguments;
    if( nextItem.curryRelease ) {
        args.unshift( nextItem.release );
    }

    // If debugging was enabled, mark the time the callback started
    if( nextItem.debug ) {
        nextItem.started = new Date();
        nextItem.running = true;
        nextItem.globalRunIndex = globalRunCount;
        nextItem.categoryRunIndex = categoryRunCount[ category ];
        duplicateDebugData( nextItem );
    }

    // Increment global counters
    globalRunCount += 1;
    categoryRunCount[ category ] += 1;

    // Perform the callback which should start something which consumes this
    // category's resource
    nextItem.callback.apply( nextItem.context , args );

    // Recurse in case there's room to execute more
    next( category );
};

// Convenience method to isolate debug data from runtime so user can't meddle
// and break things
duplicateDebugData = function( config ) {
    var s; // Iterator

    // Initialize and clone all attributes
    config.release.debug = {};
    for( s in config ) {
        if( 'release' !== s ) {
            config.release.debug[ s ] = config[ s ];
        }
    }
};

// What the developer has access to
exports.ch = {

    // Set the max amount for a category
    setMax: function( category , amount ) {
        // Category is optional
        if( undefined === amount ) {
            amount = category;
            category = undefined;
        }

        // Explicit typecast
        amount = Number( amount );

        // Only positive amounts allowed
        if( 0 >= amount ) {
            throw 'concurrency-handler.setMax(): Invalid amount: ' + amount;
        }

        // Normalize category
        category = createCategory( category );

        // Set the max
        max[ category ] = amount;

        // Check if we have additional capacity and something on the queue
        next( category );

        // Chainable
        return this;
    },

    // Get configuration
    getMax: function( category ) {
        // Normalize category
        category = createCategory( category );

        // Accessor
        return max[ category ];
    },

    // Set the max amount for a category
    onDrain: function( category , callback ) {
        // Category is optional
        if( undefined === callback ) {
            callback = category;
            category = undefined;
        }

        // Normalize category
        category = createCategory( category );

        // Set the max
        defaults[ category ].onDrain = callback;

        // Chainable
        return this;
    },

    // Get state
    getRunning: function( category ) {
        // Normalize category
        category = createCategory( category );

        // Accessor
        return consumed[ category ];
    },

    // Get state
    getFree: function( category ) {
        // Normalize category
        category = createCategory( category );

        // Basic calculation instead of stored value
        return max[ category ] - consumed[ category ];
    },

    // Explicitly alter default category
    setDefaultCategory: function( category ) {
        // Normalize and store category (whether or not normalization initialized it)
        defaultCategory = createCategory( category );

        // Chainable
        return this;
    },

    // Override/store new defaults for a given category
    setCategoryDefaults: function( category , newDefaults ) {
        var s; // Iterator

        // Category is optional
        if( undefined === newDefaults ) {
            newDefaults = category;
            category = undefined;
        }

        // Normalize category
        category = createCategory( category );

        // Copy every attribute (even if we're not currently using it, may be
        // needed in debug mode)
        for( s in newDefaults ) {
            defaults[ category ][ s ] = newDefaults[ s ];
        }

        // Chainable
        return this;
    },

    // The meat and potatoes, queue a new action
    queue: function( configIn ) {
        var config = {}; // Internal config object
        var release; // Returned release function
        var categoryDefaults; // Convenience variable

        // Sanity checks
        if( ! configIn instanceof Object ) {
            throw 'concurrency-handler.setMax(): queue: expected configuration parameter, please see documentation';
        }
        if( ! configIn.callback instanceof Function ) {
            throw 'concurrency-handler.setMax(): queue: config requires a callback, please see documentation';
        }

        // Normalize category
        config.category = createCategory( configIn.category );

        // Set for convenience
        categoryDefaults = defaults[ config.category ];

        // Import config with defaults for every value
        config.callback = configIn.callback;
        config.context = configIn.context || categoryDefaults.context || {};
        config.arguments = ( configIn.arguments instanceof Array ? configIn.arguments : categoryDefaults.arguments || [] );
        config.curryRelease = ( configIn.hasOwnProperty( 'curryRelease' ) ? configIn.curryRelease : categoryDefaults.curryRelease );
        config.amount = ( configIn.hasOwnProperty( 'amount' ) ? configIn.amount : categoryDefaults.amount );
        config.debug = ( configIn.hasOwnProperty( 'debug' ) ? configIn.debug : categoryDefaults.debug );
        config.unshift = ( configIn.hasOwnProperty( 'unshift' ) ? configIn.unshift : categoryDefaults.unshift );
        config.inQueue = true;
        config.released = false;

        // This is what gets passed back to the user.
        config.release = function() {
            // If release has been called on this already, prevent re-run as
            // that would break things
            if( config.released ) {
                return;
            }

            // If in config mode, record this extra info (not required for
            // execution)
            if( config.debug ) {
                config.running = false;
                config.completed = new Date();
            }

            // If we hadn't started running it yet, then it will still be in
            // the queue, so remove it from the queue
            if( config.inQueue ) {
                // It could have made it to the front of the queue, or it could
                // be at the back of the queue still. Sadly this means a scan
                // no matter what here.
                var index = queues[ config.category ].indexOf( config );
                if( -1 !== index ) {
                    queues[ config.category ].splice( index , 1 );
                }
            // If it has been run, then decrement its amount from the running
            // total, releasing that much resource back into the general pool
            } else {
                consumed[ config.category ] -= config.amount;
            }

            // Mark the activity released so repeated calls to the release()
            // method won't decrement the total amount of resources in use
            // again
            config.released = true;

            // Because we've changed several values, replicate out for
            // debugging
            if( config.debug ) {
                duplicateDebugData( config );
            }

            // We may have enough room for the next task now, so call upon it.
            next( config.category );
        };

        // Record some extra debugging info
        if( config.debug ) {
            config.started = null;
            config.running = false;
            config.completed = false;

            // Allow debug mode to look at the queue, but of course this is an
            // array scan
            config.getIndex = function() {
                return queues[ config.category ].indexOf( config );
            };

            // Record this as close to the .push() and next() calls as possible
            config.queued = new Date();

            // Replicate out for debugging
            duplicateDebugData( config );
        }

        // Record that this should be done, then attempt to do it if possible
        if( config.unshift ) {
            queues[ config.category ].unshift( config );
        } else {
            queues[ config.category ].push( config );
        }
        next( config.category );

        // Return the method which the user can use to cancel/finish the call
        return config.release;
    },

};
