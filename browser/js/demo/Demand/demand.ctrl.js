app.controller('DemandController', function ($scope, $state) {
	$scope.classes = classes;
  $scope.sortByType = function (type) {
    if(!type) $scope.classes = classes;
    else {
      $scope.classes = classes.filter(function (video) {
        return video.Type === type
      })
      
    }
  }
})

var classes = [
  {
    "ID": 1,
    "Type": "Chair",
    "Title": "Aerobic Chair Video",
    "Youtube": "https://www.youtube.com/watch?v=m7zCDiiTBTk"
  },
  {
    "ID": 2,
    "Type": "Chair",
    "Title": "Priority One",
    "Youtube": "https://www.youtube.com/watch?v=OA55eMyB8S0"
  },
  {
    "ID": 3,
    "Type": "Chair",
    "Title": "Low Impact Chair Aerobics",
    "Youtube": "https://www.youtube.com/watch?v=2AuLqYh4irI"
  },
  {
    "ID": 4,
    "Type": "Chair",
    "Title": "Advanced Chair Exercise",
    "Youtube": "https://www.youtube.com/watch?v=OC9VbwyEG8U"
  },
  {
    "ID": 5,
    "Type": "Yoga",
    "Title": "Gentle Yoga",
    "Youtube": "https://www.youtube.com/watch?v=G8BsLlPE1m4"
  },
  {
    "ID": 6,
    "Type": "Yoga",
    "Title": "Gentle chair yoga routine",
    "Youtube": "https://www.youtube.com/watch?v=KEjiXtb2hRg"
  },
  {
    "ID": 7,
    "Type": "Yoga",
    "Title": "Wheelchair Yoga",
    "Youtube": "https://www.youtube.com/watch?v=FrVE1a2vgvA"
  },
  {
    "ID": 8,
    "Type": "Yoga",
    "Title": "Energizing Chair Yoga",
    "Youtube": "https://www.youtube.com/watch?v=k4ST1j9PfrA"
  },
  {
    "ID": 9,
    "Type": "Fall",
    "Title": "Balance Exercise",
    "Youtube": "https://www.youtube.com/watch?v=z-tUHuNPStw"
  },
  {
    "ID": 10,
    "Type": "Fall",
    "Title": "Fall Prevention Exercises",
    "Youtube": "https://www.youtube.com/watch?v=NJDAoBoldr4"
  },
  {
    "ID": 11,
    "Type": "Fall",
    "Title": "7 Balance Exercises",
    "Youtube": "https://www.youtube.com/watch?v=vGa5C1Qs8jA"
  },
  {
    "ID": 12,
    "Type": "Fall",
    "Title": "Postural Stability",
    "Youtube": "https://www.youtube.com/watch?v=z6JoaJgofT8"
  },
  {
    "ID": 13,
    "Type": "Tai Chi",
    "Title": "Easy Qigong",
    "Youtube": "https://www.youtube.com/watch?v=ApS1CLWO0BQ"
  },
  {
    "ID": 14,
    "Type": "Tai Chi",
    "Title": "Tai Chi for Beginners",
    "Youtube": "https://www.youtube.com/watch?v=VSd-cmOEnmw"
  },
  {
    "ID": 15,
    "Type": "Tai Chi",
    "Title": "Tai Chi for Seniors",
    "Youtube": "https://www.youtube.com/watch?v=WVKLJ8BuW8Q"
  },
  {
    "ID": 16,
    "Type": "Tai Chi",
    "Title": "Low Impact Tai Chi",
    "Youtube": "https://www.youtube.com/watch?v=ha1EF4YyvUw"
  }
];
