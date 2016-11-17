app.config(function ($stateProvider) {

    $stateProvider.state('demo.On-Demand', {
        url: '/on-demand',
        templateUrl: 'js/demo/Demand/on-demand.html',
        controller: 'DemandController'
    });

});