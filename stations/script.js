/**
 * CT interactive station editor
 */

var source   = $("#station-template").html();
var template = Handlebars.compile(source);
var navbar_template = Handlebars.compile($("#navbar-template").html());

Handlebars.registerHelper('enabled', function(value) {
    if(value == "t") {
        return new Handlebars.SafeString('<i class="fa fa-fw fa-check"></i>');
    } else {
        return new Handlebars.SafeString('<i class="fa fa-fw fa-times"></i>');
    }
});

var Esri_WorldImagery = L.tileLayer('http://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
	attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
});

var opentransport = L.tileLayer('http://{s}.tile.thunderforest.com/transport/{z}/{x}/{y}.png');

var mapboxTiles = L.tileLayer('https://{s}.tiles.mapbox.com/v3/tristramg.i9nk740e/{z}/{x}/{y}.png', {
    attribution: '<a href="http://www.mapbox.com/about/maps/" target="_blank">Terms &amp; Feedback</a>'
});


var map = L.map('map')
    .addLayer(opentransport)
    .setView([48.8566,2.3318], 12);

map.addControl(new L.Control.Layers({'Mapbox':mapboxTiles, 'Satellite': Esri_WorldImagery, 'OpenTransport': opentransport }));
L.control.scale().addTo(map);
map.addControl(L.mapbox.geocoderControl('tristramg.i9nk740e', {
    position: 'topright'
}));

var station;
var marker;
var stations = {};
var github;
var ct_repo;
var repo;
var user;

function update_navbar(user_data) {
    $("#navbar").html(navbar_template(user_data));

    $("#navbar").on("click", "#logout-link", function() {
        localStorage.removeItem("github_token");
        window.location = "./index.html";
    });
}

function update_station(data) {
    station = data;
    $("#station").html(template(station));

    if(station.latitude != null && station.longitude != null) {

        if(marker != null) {
            map.removeLayer(marker);
        }

        coordinates = [station.latitude, station.longitude];
        marker = L.marker(coordinates, {
            icon: L.mapbox.marker.icon({
                'marker-size': 'large',
                'marker-symbol': 'rail',
                'marker-color': '#fa0'
            }),
            draggable: true
        });
        marker.addTo(map);
        marker.on( "dragend", function(){
            console.log("dragged");
            station.latitude = marker.getLatLng().lat;
            station.longitude = marker.getLatLng().lng;
            station.coordinates_changed = true;
            initialize_street_view(station.latitude, station.longitude);
            $("#station").html(template(station));
        });

        map.on( "dblclick", function(data) {
          marker.setLatLng(data.latlng);
          console.log("dblclick");
          station.latitude = marker.getLatLng().lat;
          station.longitude = marker.getLatLng().lng;
          station.coordinates_changed = true;
          initialize_street_view(station.latitude, station.longitude);
          $("#station").html(template(station));
        });
        map.panTo(coordinates, {animate: true, duration: 1.0});
   }
    window.history.pushState(station, "Station " + station.id, '#' + station.id);
}


function initialize_street_view(lat, lng) {
  var streetview_pos = new google.maps.LatLng(lat, lng);
  var panoramaOptions = {
    position: streetview_pos,
    pov: {
      heading: 165,
      pitch: 0
    },
    zoom: 1
  };
  var streetview = new google.maps.StreetViewPanorama(
      document.getElementById('streetview'),
      panoramaOptions);
  streetview.setVisible(true);
}

function show_station() {
    var hash = window.location.hash;
    if(hash) {
        update_station(stations[hash.substring(1)]);
    } else {
        update_station(stations["4916"]);
    }
}

function rebase() {
    var rebase = new Promise(function(resolve, reject) {
        var pull = {
            title: "Rebase Pull Request",
            body: "This pull request has been automatically generated by JS",
            base: "master",
            head: "captaintrain:master"
        };
        repo.createPullRequest(pull, function(err, pullRequest) {
            if(err) { reject(err); }
            else { console.log("PR success"); resolve(pullRequest); }
        });
    }).then(pullRequest => new Promise(function(resolve, reject) {
        var merge = {
            commit_message: "Merge pull request",
            sha: pullRequest.head.sha
        };
        repo.mergePullRequest(pullRequest.number, merge, function(err) {
            if(err) { reject(err); }
            else { console.log("Merge success!"); resolve(pullRequest.head.sha);}
        });
    })).then(sha => new Promise(function(resolve, reject) {
        repo.updateHead("master", sha, function(err) {
            if(err) { reject(err); }
            else { resolve(); }
        });
    }))
    .then(() => { console.log("Rebase successful!") })
    .catch(err => {console.log("Rebase error"); console.log(err); })
}

function create_pr() {
    // TODO: what is the newbranch doesnot exist?
    // TODO: what if master is not up to date with upstream?
    var new_branch = 'newbranch';

    var branchPromise = new Promise( function(resolve, reject) {
        console.log("branch");
        repo.branch('master', new_branch, function(err) {
            if(err) { console.log("branch fail"); reject(err); }
            else { console.log("branch ok"); resolve(); }
        });
    }).then( () => new Promise( function(resolve, reject) {
        console.log("head");
        repo.getRef("heads/" + new_branch, function(err, commitSHA) {
            if(err) { reject(err); }
            else { console.log("head ok" + commitSHA); resolve(commitSHA); }
        })
    })).then(commitSHA => new Promise( function(resolve, reject) {
        console.log("getTree");
        repo.getCommit(new_branch, commitSHA, function(err, tree) {
            if(err) { reject(err); }
            else { console.log("getTree ok: " + tree.sha); console.log(tree); resolve({commit: commitSHA, tree: tree.sha}); }
        })
    })).then(shas => new Promise( function(resolve, reject) {
        console.log("post");
        var content = Papa.unparse( $.map(stations, el => el), {delimiter: ";", newline: "\n"} );
        repo.updateTreeContent(shas.tree, "stations.csv", content + "\n", function(err, newTreeSHA) {
            if(err) { reject(err); }
            else { console.log("post ok, tree: " + newTreeSHA); resolve({commit: shas.commit, tree: newTreeSHA}); }
        });
    })).then(shas => new Promise( function(resolve, reject) {
        console.log("ref " + shas.tree);
        repo.commit(shas.commit, shas.tree, "Automated commit message", function(err, newCommit) {
            if(err) { reject(err); }
            else { console.log("ref ok") ; resolve(newCommit); }
        });
    })).then(commitSHA => new Promise( function(resolve, reject) {
        console.log("setting head " + commitSHA);
        repo.updateHead(new_branch, commitSHA, function(err) {
            if(err) { reject(err); }
            else { console.log("setting head ok"); resolve(); }
        });
    })).then( () => new Promise( function(resolve, reject) {
        console.log("Making the PR");
        var pull = {
            title: "Automated PR",
            body: "This pull request has been automatically generated by JS",
            base: "master",
            head: user + ":" + new_branch
        };
        ct_repo.createPullRequest(pull, function(err, pullRequest) {
            if(err) { reject(err); }
            else { console.log("PR success"); resolve(); }
        });
    })).catch(err => { console.log("Error"); console.log(err) });
}

function csv_loaded() {
    show_station();
    window.onhashchange = show_station;
}

function read_blob(err, contents) {
    if(err) {
        console.log("Error while loading stations.csv");
        console.log(err);
    } else {
        Papa.parse(contents, {
            header: true,
            complete: csv_loaded,
            step: function(row) {
                if(row.data[0].id) {
                    stations[row.data[0].id] = row.data[0];
                }
            }
        });
    }
}


function load_csv() {
    ct_repo.getTree('master', function(err, tree) {
        if(err) {
            console.log("Error while trying to get stations.csv");
            console.log(err);
        } else {
            for(var i = 0; i < tree.length; i++) {
                if(tree[i].path == "stations.csv") {
                    console.log("Got sha " + tree[i].sha);
                    ct_repo.getBlob(tree[i].sha, read_blob);
                }
            }
        }
    });
}

function userRepo() {
    return "stations-1";
}

function init() {
    var regex = new RegExp("[\\?&]token=([^&#]*)"),
        urlGroups = regex.exec(location.search),
        urlToken = urlGroups === null ? null : urlGroups[1],
        localToken = localStorage.getItem("github_token");

    if (urlToken === null && localToken === null) {
        window.location = "./index.html";
    } else {
        github = new Github({
            token: urlToken || localToken,
            auth: "oauth"
        });

        console.log("User token is " + (urlToken || localToken) + " (" + (urlToken !== null ? "using URL token" : "using localStorage") + ")");

        var gh_user = github.getUser();

        gh_user.user(function(err, user_infos) {
            console.log(user_infos);
            if (err) {
                alert("Could not get user informations");
                localStorage.removeItem("github_token");
                window.location = "./index.html";
            } else {
                if (urlToken !== null) {
                    localStorage.setItem("github_token", urlToken);
                    window.location = "./edit.html" + window.location.hash;
                }

                update_navbar(user_infos);
                user = user_infos.login;
                ct_repo = github.getRepo('captaintrain', 'stations');
                repo = github.getRepo(user, userRepo());
                load_csv();
            }
        });
    }
}

init();

