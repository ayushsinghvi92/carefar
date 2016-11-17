app.config(function ($stateProvider) {

    // Register our *demo* state.
    $stateProvider.state('demo', {
        url: '/demo',
        controller: 'DemoController',
        templateUrl: 'js/demo/demo.html'
    });

});
