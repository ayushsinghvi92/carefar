app.config(function ($stateProvider) {

    $stateProvider.state('demo.Trainer', {
        url: '/trainers',
        templateUrl: 'js/demo/Trainers/trainers.html',
        controller: 'TrainerController'
    });

});