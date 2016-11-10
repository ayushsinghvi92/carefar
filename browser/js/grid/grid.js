app.controller('modalCtrl', function (content, $scope) {
	$scope.content = content;	
})

app.controller('gridCtrl', function ($scope, $uibModal) {	

	$scope.openModal = function () {
		$uibModal.open({
			templateUrl: 'js/grid/modalContent.html'
			},
			controller: 'modalCtrl'
		})
	}
})

