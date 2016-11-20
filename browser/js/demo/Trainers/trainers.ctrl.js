app.controller('TrainerController', function ($scope, $state) {
	$scope.trainers = trainers.sort();
})

var trainers = [
	{
		name: 'John Hancock',
		image: 'http://lorempixel.com/100/100',
		speciality: 'Chair'
	},
	{
		name: 'Sebastian Lofgren',
		image: 'http://lorempixel.com/120/120',
		speciality: 'Chair'
		
	},
	{
		name: 'Donald Trump',
		image: 'http://lorempixel.com/110/110',
		speciality: 'Aerobics'
	},
	{
		name: 'Bill Hader',
		image: 'http://lorempixel.com/105/105',
		speciality: 'Personal Trainer'
	},
	{
		name: 'Salvador Dali',
		image: 'http://lorempixel.com/101/101',
		speciality: "Physical Therapist"
	}
]
