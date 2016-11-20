app.config(function ($stateProvider) {

    $stateProvider.state('demo', {
        url: '/demo',
        templateUrl: 'js/demo/demo.html',
        controller: 'DemoController'
    });

});