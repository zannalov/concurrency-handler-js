What is the concurrency handler?
================================

This is a simple approach to handling resource concurrency limits within a
single system thread. Most commonly this would be used with network sockets and
file descriptors.

Goals
=====

1. Keep a FIFO queue of requested calls
2. Enforce a max number of calls being executed concurrently within the entire thread
3. If the concurrency limit is raised, immediately run more operations (if lowered, allow current operations to complete)
4. Provide flexible callback options (curry into callback, pass-through arguments, etc.)

Minimal Use Example
===================

This is about the most simplistic use-case you could have:

    var ch = require( 'ch' ).ch;

    function myFirstFunction( callback ) {
        setTimeout( function() {
            callback();
        } , 1000 );
    }

    function mySecondFunction( callback ) {
        callback(); // Immediately finished
    }

    ch.queue({ callback: myFirstFunction });
    ch.queue({ callback: mySecondFunction });
    ...

The above will not run mySecondFunction until myFirstFunction finishes after one second.

API
===

First, you have to import the library.

    var ch = require( 'ch' ).ch;

You may optionally set the maximum number of concurrent operations per category
(if no category is specified, the current default category will be used). By
default the maximum number of concurrent operations per category is one, to be
safe. You'll probably want to increase this.

    ch.setMax( [category] , amount );

You may manually specify the default category, which will be used going forward
until you manually change it again. If no default category is specified, then
the first category specified is the default (and if the first call which can
take a category has no category specified, then an empty string is used).

    ch.setDefaultCategory( category );

You may set any defaults for a category except for the category (as that is set
by the preceeding method). These will be used if the corresponding value is not
set on an individual queue operation.

    ch.setCategoryDefaults({
        amount: 1,
        curryRelease: false,
        debug: false,
        arguments: null,
    });

At any point while running, you can get the max resources available for a
category (e.g. 1024 concurrent file descriptors), how many operations are
consuming descriptors, and how may remain.

    ch.getMax( [category] );
    ch.getRunning( [category] );
    ch.getFree( [category] );

The most oft-used operation will be the queue() call. This call will wait to
run the passed callback until enough resources from that category are
available. For example, if you know you're going to need three file
descriptors, you might set category to 'fd' and amount to 3. If the resources
are immediately available, the callback will be run inline (not deferred).

    release = ch.queue({
        callback: function,
        [context: object],
        [curryRelease: boolean],
        [arguments: array],
        [category: category],
        [amount: number],
        [debug: boolean],
        [unshift: boolean],
    });

The release method is used to indicate when the callback no longer requires its
resources (release the resources back into the wild). It is returned from the
queue() call, but can also be curried onto the front of the callback argument
list with the curryRelease option.

    release();

If debugging is enabled (by default or for a particular call), additional
information can be found on the "debug" property of the release method.

    console.log( release.debug ); // Only if debug was set true
