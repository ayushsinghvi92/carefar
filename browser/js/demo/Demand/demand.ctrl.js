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
    "ImageUrl":"https://img.youtube.com/vi/m7zCDiiTBTk/default.jpg",
    "Youtube": "https://www.youtube.com/watch?v=m7zCDiiTBTk"
  },
  {
    "ID": 2,
    "Type": "Chair",
    "Title": "Priority One",
    "ImageUrl":"https://img.youtube.com/vi/OA55eMyB8S0/default.jpg",
    "Youtube": "https://www.youtube.com/watch?v=OA55eMyB8S0"
  },
  {
    "ID": 3,
    "Type": "Chair",
    "Title": "Low Impact Chair Aerobics",
    "ImageUrl":"https://img.youtube.com/vi/2AuLqYh4irI/default.jpg",
    "Youtube": "https://www.youtube.com/watch?v=2AuLqYh4irI"
  },
  {
    "ID": 4,
    "Type": "Chair",
    "Title": "Advanced Chair Exercise",
    "ImageUrl":"https://img.youtube.com/vi/OC9VbwyEG8U/default.jpg",
    "Youtube": "https://www.youtube.com/watch?v=OC9VbwyEG8U"
  },
  {
    "ID": 5,
    "Type": "Yoga",
    "Title": "Gentle Yoga",
    "ImageUrl":"https://img.youtube.com/vi/G8BsLlPE1m4/default.jpg",
    "Youtube": "https://www.youtube.com/watch?v=G8BsLlPE1m4"
  },
  {
    "ID": 6,
    "Type": "Yoga",
    "Title": "Gentle chair yoga routine",
    "ImageUrl":"https://img.youtube.com/vi/KEjiXtb2hRg/default.jpg",
    "Youtube": "https://www.youtube.com/watch?v=KEjiXtb2hRg"
  },
  {
    "ID": 7,
    "Type": "Yoga",
    "Title": "Wheelchair Yoga",
    "ImageUrl":"https://img.youtube.com/vi/FrVE1a2vgvA/default.jpg",
    "Youtube": "https://www.youtube.com/watch?v=FrVE1a2vgvA"
  },
  {
    "ID": 8,
    "Type": "Yoga",
    "Title": "Energizing Chair Yoga",
    "ImageUrl":"https://img.youtube.com/vi/k4ST1j9PfrA/default.jpg",
    "Youtube": "https://www.youtube.com/watch?v=k4ST1j9PfrA"
  },
  {
    "ID": 9,
    "Type": "Fall",
    "Title": "Balance Exercise",
    "ImageUrl":"https://img.youtube.com/vi/z-tUHuNPStw/default.jpg",
    "Youtube": "https://www.youtube.com/watch?v=z-tUHuNPStw"
  },
  {
    "ID": 10,
    "Type": "Fall",
    "Title": "Fall Prevention Exercises",
    "ImageUrl":"https://img.youtube.com/vi/NJDAoBoldr4/default.jpg",
    "Youtube": "https://www.youtube.com/watch?v=NJDAoBoldr4"
  },
  {
    "ID": 11,
    "Type": "Fall",
    "Title": "7 Balance Exercises",
    "ImageUrl":"https://img.youtube.com/vi/vGa5C1Qs8jA/default.jpg",
    "Youtube": "https://www.youtube.com/watch?v=vGa5C1Qs8jA"
  },
  {
    "ID": 12,
    "Type": "Fall",
    "Title": "Postural Stability",
    "ImageUrl":"https://img.youtube.com/vi/z6JoaJgofT8/default.jpg",
    "Youtube": "https://www.youtube.com/watch?v=z6JoaJgofT8"
  },
  {
    "ID": 13,
    "Type": "Tai Chi",
    "Title": "Easy Qigong",
    "ImageUrl":"https://img.youtube.com/vi/ApS1CLWO0BQ/default.jpg",
    "Youtube": "https://www.youtube.com/watch?v=ApS1CLWO0BQ"
  },
  {
    "ID": 14,
    "Type": "Tai Chi",
    "Title": "Tai Chi for Beginners",
    "ImageUrl":"https://img.youtube.com/vi/VSd-cmOEnmw/default.jpg",
    "Youtube": "https://www.youtube.com/watch?v=VSd-cmOEnmw"
  },
  {
    "ID": 15,
    "Type": "Tai Chi",
    "Title": "Tai Chi for Seniors",
    "ImageUrl":"https://img.youtube.com/vi/WVKLJ8BuW8Q/default.jpg",
    "Youtube": "https://www.youtube.com/watch?v=WVKLJ8BuW8Q"
  },
  {
    "ID": 16,
    "Type": "Tai Chi",
    "Title": "Low Impact Tai Chi",
    "ImageUrl":"https://img.youtube.com/vi/ha1EF4YyvUw/default.jpg",
    "Youtube": "https://www.youtube.com/watch?v=ha1EF4YyvUw"
  }
];
