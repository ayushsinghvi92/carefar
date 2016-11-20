app.config(function ($stateProvider) {

    $stateProvider.state('demo.nearby', {
        url: '/nearby',
        templateUrl: 'js/demo/Friends/nearby/nearby.html',
        controller: 'FriendsController'
    });

});