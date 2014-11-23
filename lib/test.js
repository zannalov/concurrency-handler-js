var ch = require( './concurrency-handler' ).ch;

console.log( ch );
ch.setDefaultCategory( 'odds' );
ch.setMax( 10 );
ch.setMax( 'evens' , 1 );
ch.onDrain( function( category ) {
    console.log( 'drained' , category );
} );

var x;
for( x = 0 ; x < 100 ; x ++ ) { (function(y) {
        var release = ch.queue({
            category: ( x % 2 ? 'odds' : 'evens' ),
            callback: function( release ) {
                console.log( 'starting ' + y );
                setTimeout( function() {
                    console.log( 'finished ' + y );
                    release();
                } , ( Math.random() * 1000 ) + 1000 );
            },
            amount: ( x % 2 ? 1 + Math.floor( Math.random() * 9 ) : 1 ) ,
            curryRelease: true,
        });
        if( 0 === x % 10 ) {
            release();
        }
    })(x);
}
