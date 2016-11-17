
app.controller('gridCtrl', function ($scope, $uibModal) {	

	$scope.openModal = function () {
		$uibModal.open({
			templateUrl: 'js/grid/modalContent.html'
		})
	}
})

