/**
 * Create new domain instance, load assembly and run entry point.
 */

const AppDomain = require('./CLR/AppDomain');

var appDomain = new AppDomain(1);
appDomain.loadAssembly("Test.exe", function (a) {
    if (a == undefined) {
        console.log('Empty program');
        return;
    }
    a.run();
});
