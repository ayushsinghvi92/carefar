
app.controller('gridCtrl', function ($scope, $uibModal) {	

	$scope.openModal = function () {
		console.log('hitting open modal')
		$uibModal.open({
			templateUrl: 'js/grid/modalContent.html'
		})
	}
})

