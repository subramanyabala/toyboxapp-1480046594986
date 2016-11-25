/*eslint-env node*/

//------------------------------------------------------------------------------
// node.js starter application for Bluemix
//------------------------------------------------------------------------------

// This application uses express as its web server
// for more info, see: http://expressjs.com
var express = require('express');
var request = require('request');
var bodyParser = require('body-parser');
var cfenv = require('cfenv');
var unzip = require('unzip');
var fs = require('fs');
var busboy = require('connect-busboy');
var path = require('path');
var Client = require('node-rest-client').Client;
var appEnv = cfenv.getAppEnv();
var pkgcloud = require('pkgcloud');
var engine = require('ejs-locals');
var client = new Client();
var config = {
	provider: 'openstack',
	useServiceCatalog: true,
	useInternal: false,
	keystoneAuthVersion: 'v3',
	authUrl: 'https://identity.open.softlayer.com',
	tenantId: '8f2de9f4b4054071abd54c692010016f', //projectId from credentials
	domainId: 'a3f7b472d54543ca9e864e522f93788e',
	username: 'admin_a0736a15460ec3871b56fb762198e2f28ef34978',
	password: 'D?3ny^#L]aXzc9N#',
	region: 'dallas' //dallas or london region
};

var appName = [];
var mobileName = [];
var urls = [];
var uname;
var storageClient = pkgcloud.storage.createClient(config);
var containername;

if (typeof localStorage === "undefined" || localStorage === null) {
  var LocalStorage = require('node-localstorage').LocalStorage;
  localStorage = new LocalStorage('./scratch');
}

storageClient.auth(function(err) {
	if (err) {
		console.error(err);
	} else {
		console.log(storageClient._identity);
	}
});
//Setup middleware.
var app = express();
app.engine('ejs', engine);
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
// parse application/x-www-form-urlencoded 
app.use(bodyParser.urlencoded({
	extended: false
}));
app.use(busboy());
// parse application/json 
app.use(bodyParser.json());

app.use('/login', function(req, res) {
	var responseString;
	var user_name = req.body.Username;
	var pass = req.body.Password;
	var json = {
		data: {
			username: user_name,
			password: pass
		},
		headers: {
			"Content-Type": "application/json"
		}
	};
	client.post("https://lpspoc.cognizant.com/crisis-web-1.0/userauth/login", json, function(data, response) {
		// parsed response body as js object 
		console.log("response" + data.loginStatus);
		uname = data.email;
		if (data.loginStatus === "true") {
			
			localStorage.setItem("id", data.username);
			localStorage.setItem("name", data.email.replace("@cognizant.com","").replace("."," "));

			storageClient.getContainers(function(err, containers) {
				if (containers.indexOf(user_name) > -1) {
					containername = user_name;
				} else {
					containername = user_name;
					var ObjectStorage = require('bluemix-object-storage');
					var os = new ObjectStorage('6ad915b6acb841b792822600b2a9350e', 'D?3ny^#L]aXzc9N#', '8f2de9f4b4054071abd54c692010016f', containername, 'https://dal.objectstorage.open.softlayer.com');
					os.createContainer()
						.then(function() {
							return os.setContainerPublicReadable();
						});
				}
			});

			res.writeHead(302, {
				'Location': '/preview'
					//add other headers here...
			});
			res.end();
		}
	});
	client.on('error', function(err) {
		console.error('Something went wrong on the client', err);
	});
});

app.use('/upload', function(req, res) {

	req.busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
		var dir = 'public/app' + containername;
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir);
		}
		var upload = storageClient.upload({
			container: containername,
			remote: filename
		});
		upload.on('error', function(err) {
			console.error(err);
		});
		upload.on('success', function(file) {
			console.log("file " + file);
			storageClient.getFiles(containername, function(err, files) {
				if (err) {
					console.error(err);
				} else {
					files.forEach(function(fileName) {
						storageClient.download({
							container: containername,
							remote: fileName.name,
							local: 'public/app/' + fileName.name
						}, function(err, result) {
							if (fileName.name.indexOf(".zip") !== -1) {
								appName.push({
									name: fileName.name.substring(0, fileName.name.indexOf("."))
								});
								urls.push({
									appurl: 'https://toyboxtest.mybluemix.net/app/' + fileName.name.substring(0, fileName.name.indexOf(".")) + '/index.html'
								});

							} else if (fileName.name.indexOf(".apk") !== -1) {
								request.post({
									url: 'https://tok_wu8qwqy5xqm0z9vg83m4jju8rg@api.appetize.io/v1/apps',
									json: {
										url: 'https://dal.objectstorage.open.softlayer.com/v1/AUTH_8f2de9f4b4054071abd54c692010016f/' + containername + '/' + fileName.name,
										platform: 'android'
									}
								}, function(err, response, body) {
									if (err) {
										// connection error
										console.log('Error', err);
									} else if (response.statusCode !== 200) {
										// API returned error
										console.log('API error', body);
									} else {
										// success
										mobileName.push({
											name: body.data[0].publickey
										});
									}
								});
							}
						});
					});
				}
			});
		});
		file.pipe(upload);
	});
	req.busboy.on('finish', function() {
			res.writeHead(302, {
		'Location': '/preview'
			//add other headers here...
	});
	res.end();
	});
	req.pipe(req.busboy);
});

app.get('/preview', function(req, res) {
	if (!localStorage.getItem("name")) {
		 return res.redirect('/login.html');
	} else {
	
		storageClient.getFiles(containername, function(err, files) {
			if (err) {
				console.error(err);
			} else {
				files.forEach( function(fileName) {

					storageClient.download({
						container: containername,
						remote: fileName.name,
					}, function(err, result) {
						
						if (!err) {
							console.log("Result: " + JSON.stringify(result));

							if (fileName.name.indexOf(".zip") !== -1) {
								
								appName.push({
									name: fileName.name.substring(0, fileName.name.indexOf("."))
								});
								urls.push({
									appurl: 'https://toyboxtest.mybluemix.net/app/' + containername + '/' + fileName.name.substring(0, fileName.name.indexOf(".")) + '/index.html'
								});

								/*fs.createReadStream('https://dal.objectstorage.open.softlayer.com/v1/AUTH_8f2de9f4b4054071abd54c692010016f/' + containername +'/' + fileName.name).pipe(unzip.Extract({
									path: 'public/app/'+ containername + '/'
								}));*/

							} else if (fileName.name.indexOf(".apk") !== -1) {
								request.get({
									url: 'https://tok_wu8qwqy5xqm0z9vg83m4jju8rg@api.appetize.io/v1/apps',
								}, function(err, response, body) {
									if (err) {
										// connection error
										console.log('Error', err);
									} else if (response.statusCode !== 200) {
										// API returned error
										console.log('API error', body);
									} else {
										// success
										mobileName.push({
											name: body.data[0].publickey
										});
									}
								});
							}
						}
					});//.pipe(fs.createWriteStream('public/app/' + fileName.name));
				});
			}
			res.render('pages/preview', {
				apps: appName,
				name: uname,
				links: urls,
				mapps: mobileName,
				name: localStorage.getItem("name")
			});
		});
	}
	
});


app.listen(appEnv.port, appEnv.bind);
console.log('App started on ' + appEnv.bind + ':' + appEnv.port);