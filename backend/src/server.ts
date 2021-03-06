import * as bodyParser from "body-parser";
import * as cookieParser from "cookie-parser";
import * as errorHandler from 'errorhandler';
import * as methodOverride from 'method-override';
import * as logger from "morgan";
import * as path from "path";
import * as cors from 'cors';
import * as express from "express";
import { Application, NextFunction, Request, Response, Router } from "express";
import mongoose = require('mongoose');

import * as passport from 'passport';
import { PassportLoader } from './passport';



// Routes
import { PublicRoute } from './routes/public';
import { SecuredRoute } from './routes/secure';


// Data Models
import { CORE_DATA_MODEL } from '../shared/models/model';
import { IPolicy, IPolicyModel, policySchema } from '../shared/models/policy';
import { IPolicyHolder, IPolicyHolderModel, policyHolderSchema } from '../shared/models/policyHolder';



/**
 * The server.
 *
 * @class Server
 */
export class Server {

  public app: Application;

  public db: mongoose.Connection;
  private policyModel?: mongoose.Model<IPolicyModel>;
  private policyHolderModel?: mongoose.Model<IPolicyHolderModel>;

  private dataModel: CORE_DATA_MODEL;
  private PUBLIC_WEBROOT: string = process.env.PUBLIC_WEBROOT || './';
  //private passport: any;


  /**
   * Bootstrap the application.
   *
   * @class Server
   * @method bootstrap
   * @static
   * @return {ng.auto.IInjectorService} Returns the newly created injector for this app.
   */
  public static bootstrap(): Server {
    return new Server();
  }

  /**
   * Constructor.
   *
   * @class Server
   * @constructor
   */
  constructor() {
    //default data model
    this.dataModel = new CORE_DATA_MODEL();

    //create expressjs application
    this.app = express();

    //default authentication / authorization module
    //this.passport = passport;
    this.app.use(passport.initialize());

    //configure application
    this.config();

    //add routes
    this.routes();

    //add api
    this.api();
  }

  /**
   * Create REST API routes
   *
   * @class Server
   * @method api
   */
  public api() {
    //empty for now
  }

  /**
   * Configure application
   *
   * @class Server
   * @method config
   */
  public config() {
    //add static paths
    this.app.use(express.static(path.join(__dirname, (process.env.PUBLIC_WEBROOT_RELATIVE_PATH || '../../frontend/dist'))));
  
    //configure jade
    this.app.set("views", path.join(__dirname, "../dist/views"));
    this.app.set("view engine", "jade");
  
    //use logger middlware
    this.app.use(logger("dev"));

    //enable CORS for different OAuth protocols between UI and server
    this.app.use(cors());
  
    //use json form parser middlware
    this.app.use(bodyParser.json());
  
    //use query string parser middlware
    this.app.use(bodyParser.urlencoded({extended: true}));
  
    //use cookie parser middleware
    this.app.use(cookieParser());
  
    //use override middlware
    this.app.use(methodOverride());

    //use proxy address as hostname
    this.app.enable("trust proxy");

    //make sure the Authorization header is allowed in all browser contexts
    this.app.use((req, res, next) => {
      res.header('Access-Control-Expose-Headers', 'Authorization');
      next();
    });
  
    //use q promises
    global.Promise = require("q").Promise;
    mongoose.Promise = global.Promise;

    // Setup Mongoose and the connection with MongoDB
    const MONGODB_CONNECTION: string = process.env.MONGODB_URI || 'mongodb://127.0.0.1/poc';
    mongoose.connect(MONGODB_CONNECTION, {})
    .then((mongooseConnector) => {
        //create models
        this.policyModel = mongooseConnector.connection.model<IPolicyModel>("Policy", policySchema);
        this.policyHolderModel = mongooseConnector.connection.model<IPolicyHolderModel>("PolicyHolder", policyHolderSchema);
        let PolicyHolder = this.policyHolderModel;
        
        PassportLoader.configure(passport, PolicyHolder);

    }).catch((err) => {
        console.log('Error while connecting to the DB');
        console.error(err);
    });
    
    //catch 404 and forward to error handler
    this.app.use(function(err: any, req: express.Request, res: express.Response, next: express.NextFunction) {
      err.status = 404;
      next(err);
    });

    //error handling
    this.app.use(errorHandler());

  }

  /**
   * Create router
   *
   * @class Server
   * @method routes
   */
  public routes() {
    // Add the public routes to the router and tell Express to use them
    console.log("Creating all public routes.");

    //add home page route
    this.app.get("/", (req: Request, res: Response, next: NextFunction) => {
      new PublicRoute(this.dataModel, this.policyModel, this.policyHolderModel).index(this.PUBLIC_WEBROOT, req, res, next);
    });
    this.app.get("/home", (req: Request, res: Response, next: NextFunction) => {
      new PublicRoute(this.dataModel, this.policyModel, this.policyHolderModel).index(this.PUBLIC_WEBROOT, req, res, next);
    });
    this.app.get("/signup", (req: Request, res: Response, next: NextFunction) => {
      new PublicRoute(this.dataModel, this.policyModel, this.policyHolderModel).index(this.PUBLIC_WEBROOT, req, res, next);
    });
    this.app.get("/signup/:currentStep", (req: Request, res: Response, next: NextFunction) => {
      res.redirect('/signup');
    });
    this.app.get("/confirm/:confirmationID", (req: Request, res: Response, next: NextFunction) => {
      new PublicRoute(this.dataModel, this.policyModel, this.policyHolderModel).confirmPolicyHolder(this.PUBLIC_WEBROOT, req, res, next);
    });

    //add login route
    this.app.post("/login", (req: Request, res: Response, next: NextFunction) => {
      new PublicRoute(this.dataModel, this.policyModel, this.policyHolderModel).login(req, res, next);
    });

    //add new policy creation route
    this.app.post('/policy', (req: Request, res: Response, next: NextFunction) => {
        new PublicRoute(this.dataModel, this.policyModel, this.policyHolderModel).createNewPolicy(req, res, next);
    });

    // Add the secure routes to the router and tell Express to use them, and expect a valid JWT
    console.log("Creating all JWT-requiring routes.");

    // Get a specific Policy.  
    // Using POST instead of GET, so policyID is not included in the URL/Querystring
    // Want to hide policyID's from intermediate systems (Proxies, Caches, Firewalls, etc)
    this.app.post("/policySecureRead", passport.authenticate('jwt', {session:false}), (req: Request, res: Response, next: NextFunction) => {
        new SecuredRoute(this.dataModel, this.policyModel, this.policyHolderModel).getPolicy(req, res, next);
    });

    // Update the Ethereum address for a specific Policy
    this.app.patch('/policy', passport.authenticate('jwt', {session:false}), (req: Request, res: Response, next: NextFunction) => {
      new SecuredRoute(this.dataModel, this.policyModel, this.policyHolderModel).setEthereumAddressForPolicy(req, res, next);
    });







    this.app.get('/auth/facebook', passport.authenticate('facebook-token', { session: false, scope: ['email'] }), (req: any, res: Response, next: NextFunction) => { 
      new SecuredRoute(this.dataModel, this.policyModel, this.policyHolderModel).loginFacebookUser(req, res, next);
    });
    
    //this.app.get('/auth/facebook/callback', passport.authenticate('facebook-token', { session: false }), (req: any, res: Response, next: NextFunction) => {});



    this.app.get('/auth/google', passport.authenticate('google', { scope : ['profile', 'email'] }), (req: Request, res: Response, next: NextFunction) => { 
      next ();
    });
    
    this.app.get('/auth/google/callback', passport.authenticate('google', { session: false }), (req: any, res: Response, next: NextFunction) => {
        const _googleID = req.user.google.id;
        const _policyHolderID = req.user.policyHolderID;
        const _policyHolderName = req.user.google.name;
        const _policyHolderEmail = req.user.google.email;
        const _sourceURL = 'https://' + (req.hostname == 'localhost' ? 'localhost:8000' : req.headers.host);
        const secureRouter = new SecuredRoute(this.dataModel, this.policyModel, this.policyHolderModel);
        const jwt = secureRouter.createJWT(_policyHolderName, _policyHolderID);

        let global_this = this;
        // Get the ObjectID for the PolicyHolder
        this.policyHolderModel.findOne({policyHolderID: req.user.policyHolderID})
            .exec(function(phError, policyHolder){
                if (phError) {
                    console.log('Error: Failed to communicate with the DB. ErrorMessage=' + phError.message);
                    res.render('authenticated', { hasPolicy: false, accountID: _googleID, policyHolderID: _policyHolderID, policyHolderName: _policyHolderName, email: _policyHolderEmail, sourceURL: _sourceURL });
                    return;
                }

                if (policyHolder == null){
                    console.log('Error: Failed to locate the requested PolicyHolder. PolicyHolderID=' + req.user.policyHolderID);
                    res.render('authenticated', { hasPolicy: false, accountID: _googleID, policyHolderID: _policyHolderID, policyHolderName: _policyHolderName, email: _policyHolderEmail, sourceURL: _sourceURL });
                    return;
                }
                
                global_this.policyModel.findOne({ policyHolder: policyHolder._id })  
                    .exec(function(err, policy){
                        if (err) {
                            console.log('Error: Failed to communicate with the DB. ErrorMessage=' + err.message);
                            res.render('authenticated', { hasPolicy: false, accountID: _googleID, policyHolderID: _policyHolderID, policyHolderName: _policyHolderName, email: _policyHolderEmail, sourceURL: _sourceURL });
                            return;
                        }

                        if (policy == null){
                            res.render('authenticated', { hasPolicy: false, accountID: _googleID, policyHolderID: _policyHolderID, policyHolderName: _policyHolderName, email: _policyHolderEmail, sourceURL: _sourceURL });
                        } else {
                            res.render('authenticated', { hasPolicy: true, token: jwt, sourceURL: _sourceURL });
                        }
                    });
            });
      });



  }
}


