/**
 * Create new domain instance, load assembly and run entry point.
 */

const AppDomain = require('./CLR/AppDomain');

var appDomain = new AppDomain();
appDomain.loadAssembly("Fib.exe", function (a) {
    if (a == undefined) {
        console.log('Empty program');
        return;
    }
    a.run();
});
