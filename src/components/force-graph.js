/**
 * Description
 * ===========
 * create a forcegraph component (using https://github.com/vasturiano/three-forcegraph)
 * that can be interacted with and has some networked attributes.  
 * 
 * A lot of this code is taken from the aframe-forcegraph-component in the same github user.
 *
 * To use in Spoke:
* -  width and height are the in-world max width and height around the center (width is x and z)
* - ignore the 3 "is" flags, no interactivity yet
* - ignore vueApp.  I using their "SpriteText", but it has some issues so I'm going to try switching to vueApps.  The GraphLabel vueApp is the default
* - jsonUrl:  the filename in the data repository, /forcegraph directory 
* - chargeForce is that force you used to spread the nodes, jay
* - x,y,z Force are the "push" toward 0 in that direction.  Here, I'm pushing slighty toward y to flatten the graph so it's not so tall
* - nodeId and node val are just their defaults, prob won't change, but I left them
* - nodeColor would be the field for the color of the node in the json, but we aren't using it because ...
* - ... we have nodeAutoColorBy set (to group, here).  If this is unset, it uses the color above
* - nodeOpacity is what it says
* - linkSource and linkTarget are the fields in the json for source and target. Again, just left them, probably won't change
* - linkColor and AutoColorBy and linkOpacity are same as node.	
* - linkWidth is 0, so it uses three "Lines".  Any integer above turns them into tubes, which look like garbage with these SpriteText nodes.
*   
*/
import {
    interactiveComponentTemplate,
    registerSharedAFRAMEComponents,
} from "../utils/interaction";

import SpriteText from 'three-spritetext';
import ThreeForceGraph from "three-forcegraph";

import {
    forceX as d3ForceX,
    forceY as d3ForceY,
    forceZ as d3ForceZ
} from 'd3-force-3d';

import {vueComponents as htmlComponents} from "https://resources.realitymedia.digital/vue-apps/dist/hubs.js";

///////////////////////////////////////////////////////////////////////////////
// simple convenience functions 
const parseJson = function (prop) {
    return (typeof prop === 'string')
        ? JSON.parse(prop)
        : prop; // already parsed
};

const parseFn = function (prop) {
    if (typeof prop === 'function') return prop; // already a function
    const geval = eval; // Avoid using eval directly https://github.com/rollup/rollup/wiki/Troubleshooting#avoiding-eval
    try {
        const evalled = geval('(' + prop + ')');
        return evalled;
    } catch (e) { } // Can't eval, not a function
    return null;
};

const parseAccessor = function (prop) {
    if (!isNaN(parseFloat(prop))) { return parseFloat(prop); } // parse numbers
    if (parseFn(prop)) { return parseFn(prop); } // parse functions
    return prop; // strings
};


function almostEqualVec3(u, v, epsilon) {
    return Math.abs(u.x - v.x) < epsilon && Math.abs(u.y - v.y) < epsilon && Math.abs(u.z - v.z) < epsilon;
};

// a lot of the complexity has been pulled out into methods in the object
// created by interactiveComponentTemplate() and registerSharedAFRAMEcomponents().
// Here, we define methods that are used by the object there, to do our object-specific
// work.

// We need to define:
// - AFRAME 
//   - schema
//   - init() method, which should can startInit() and finishInit()
//   - update() and play() if you need them
//   - tick() and tick2() to handle frame updates
//
// - change isNetworked, isInteractive, isDraggable (default: false) to reflect what 
//   the object needs to do.
// - loadData() is an async function that does any slow work (loading things, etc)
//   and is called by finishInit(), which waits till it's done before setting things up
// - initializeData() is called to set up the initial state of the object, a good 
//   place to create the 3D content.  The three.js scene should be added to 
//   this.simpleContainter
// - clicked() is called when the object is clicked
// - dragStart() is called right after clicked() if isDraggable is true, to set up
//   for a possible drag operation
// - dragEnd() is called when the mouse is released
// - drag() should be called each frame while the object is being dragged (between 
//   dragStart() and dragEnd())
// - getInteractors() returns an array of objects for which interaction controls are
//   intersecting the object. There will likely be zero, one, or two of these (if 
//   there are two controllers and both are pointing at the object).  The "cursor"
//   field is a pointer to the small sphere Object3D that is displayed where the 
//   interaction ray touches the object. The "controller" field is the 
///  corresponding controller
//   object that includes things like the rayCaster.
// - getIntersection() takes in the interactor and the three.js object3D array 
//   that should be tested for interaction.

// Note that only the entity that this component is attached to will be "seen"
// by Hubs interaction system, so the entire three.js tree below it triggers
// click and drag events.  The getIntersection() method is needed 

// the componentName must be lowercase, can have hyphens, start with a letter, 
// but no underscores
let componentName = "force-graph";

// get the template part of the object need for the AFRAME component
let template = interactiveComponentTemplate(componentName);

// create the additional parts of the object needed for the AFRAME component
let child = {
    schema: {
        // name is hopefully unique for each instance
        name: {
            type: "string",
            default: ""
        },

        // synchronize the state across all clients
        isNetworked: {
            type: "boolean",
            default: false
        },

        // static graph data or can be moved around
        isInteractive: {
            type: "boolean",
            default: true
        },

        // static graph data or can be moved around
        isDraggable: {
            type: "boolean",
            default: true
        },

        // if size is set, it will be used to scale the graph to that size
        height: {
            type: "number",
            default: 1
        },
        width: {
            type: "number",
            default: 1
        },

        vueApp: {
            type: "string",
            default: "GraphLabel"
        },

        textSize: {
            type: "number",
            default: "2"
        },
        // from the original forcegraph-component
        jsonUrl: { type: 'string', default: '' },

        chargeForce: { type: 'number', default: 0 },
        xForce: { type: 'number', default: 0 },
        yForce: { type: 'number', default: 0 },
        zForce: { type: 'number', default: 0 },
        nodeId: { type: 'string', default: 'id' },
        nodeVal: { parse: parseAccessor, default: 'val' },
        nodeColor: { parse: parseAccessor, default: 'color' },
        nodeAutoColorBy: { parse: parseAccessor, default: '' }, // color nodes with the same field equally
        nodeOpacity: { type: 'number', default: 0.75 },
        // leave these commented:  we might add a list of methods that could
        // be used to create the nodes.  But nothing right now.
        // nodeThreeObject: { parse: parseAccessor, default: null },
        linkSource: { type: 'string', default: 'source' },
        linkTarget: { type: 'string', default: 'target' },
        linkVisibility: { type: 'boolean', default: true },
        linkColor: { parse: parseAccessor, default: 'color' },
        linkAutoColorBy: { parse: parseAccessor, default: '' }, // color links with the same field equally
        linkOpacity: { type: 'number', default: 0.2 },
        linkWidth: { parse: parseAccessor, default: 0 }
    },

    // Bind component methods
    getGraphBbox: function () {
        if (!this.forceGraph) {
            // Got here before component init -> initialize forceGraph
            this.forceGraph = new ThreeForceGraph();
        }

        return this.forceGraph.getGraphBbox();
    },

    d3Force: function () {
        if (!this.forceGraph) {
            // Got here before component init -> initialize forceGraph
            this.forceGraph = new ThreeForceGraph();
        }

        const forceGraph = this.forceGraph;
        const returnVal = forceGraph.d3Force.apply(forceGraph, arguments);

        return returnVal === forceGraph
            ? this // return self, not the inner forcegraph component
            : returnVal;
    },

    d3ReheatSimulation: function () {
        this.forceGraph && this.forceGraph.d3ReheatSimulation();
        return this;
    },

    refresh: function () {
        this.forceGraph && this.forceGraph.refresh();
        return this;
    },

    scaleToFit: function () {
        let bbox = this.forceGraph.getGraphBbox();
        if (bbox) {
            let sizeH = bbox.y[1] - bbox.y[0];
            let sizeW = bbox.x[1] - bbox.x[0];
            sizeW = Math.max(sizeW, bbox.z[1] - bbox.z[0]);

            sizeH = this.data.height / sizeH;
            sizeW = this.data.width / sizeW;

            // want both to fix their respective sizes, so we want
            // the scale to be the smaller of the two
            let scale = Math.min(sizeH, sizeW);

            scale *= this.forceGraph.scale.x
            this.forceGraph.scale.set(scale, scale, scale);
            this.forceGraph.updateMatrix();
        }
    },


    // fullName is used to generate names for the AFRame objects we create.  Should be
    // unique for each instance of an object, which we specify with name.  If name does
    // name get used as a scheme parameter, it defaults to the name of it's parent glTF
    // object, which only works if those are uniquely named.
    init: function () {
        this.startInit();

        const state = this.state = {}; // Internal state
        this.running = false;

        this.makeSpriteText = this.makeSpriteText.bind(this);
        this.makeHTMLText = this.makeHTMLText.bind(this);

        // setup FG object
        if (!this.forceGraph) this.forceGraph = new ThreeForceGraph(); 

        this.forceGraph
            .onFinishUpdate(() => {
                if (!this.simpleContainer.getObject3D("forcegraphGroup")) {
                    this.simpleContainer.setObject3D('forcegraphGroup', this.forceGraph)
                }

                this.running = true;
                this.forceGraph.onEngineStop(() => {
                    this.running = false;
                    this.scaleToFit();
                    this.el.sceneEl.emit('updatePortals')
                })

                this.forceGraph.onEngineTick(() => {
                    // comment out:  we aren't going to rescale after the first
                    // layout is done, since it will be weird if a user drags and then
                    // it rescales when they let go
                    //this.running = true;
                })

                //this.forceGraph.d3Force('charge').strength(-200);
                // while (running) {
                //     this.forceGraph.tickFrame();
                // }
            })

        // want to use these forces
        this.forceGraph.d3Force('x', d3ForceX());
        this.forceGraph.d3Force('y', d3ForceY());
        this.forceGraph.d3Force('z', d3ForceZ());

        // override the defaults in the template
        this.isInteractive = this.data.isInteractive;
        this.isNetworked = this.data.isNetworked;
        this.isDraggable = this.data.isDraggable;

        // our potentiall-shared object state 
        this.sharedData = {
        };

        // some click/drag state
        this.clickEvent = null
        this.clickIntersection = null

        // we should set fullName if we have a meaningful name
        if (this.data.name && this.data.name.length > 0) {
            this.fullName = this.data.name;
        }

        // finish the initialization
        this.finishInit();
    },

    makeSpriteText: function (node) {
        const sprite = new SpriteText(node.name);
        sprite.material.depthWrite = false; // make sprite background transparent
        sprite.color = node.color;
        sprite.textHeight = 8;
        return sprite;
    },

    htmlGenerator: null,

    // do some stuff to get async data.  Called by initTemplate()
    loadData: async function () {
    },
    
    makeHTMLText: function (node) {    
        let ret = new THREE.Object3D();

        let scale = 150

        node._box = new THREE.Mesh(
            new THREE.BoxGeometry(2/scale, 2/scale, 2/scale, 2, 2, 2),
            new THREE.MeshBasicMaterial({
                color: node.color,
                opacity: this.data.nodeOpacity
            })
        );
        node._box.matrixAutoUpdate = true;
        ret.add(node._box)

        var titleScriptData = {
            text: node.name,
            color: node.color,
            size: this.data.textSize
        }

        node.htmlGenerator = htmlComponents["GraphLabel"](titleScriptData)
        //ret.add(this.htmlGenerator.webLayer3D);
        node.htmlGenerator.webLayer3D.matrixAutoUpdate = true

        ret.scale.x = scale
        ret.scale.y = scale
        ret.scale.z = scale

        node.htmlGenerator.waitForReady().then(() => {    
            node.htmlGenerator.webLayer3D.contentMesh.material.opacity = this.data.nodeOpacity        
            ret.add(node.htmlGenerator.webLayer3D);
            ret.remove(node._box);
            node._box = null;
        })
        return ret;

},

    // if anything changed in this.data, we need to update the object.  
    // this is probably not going to happen, but could if another of 
    // our scripts modifies the component properties in the DOM
    update: function (oldData) {
        const comp = this;
        const elData = this.data;
        const diff = AFRAME.utils.diff(elData, oldData);

        const fgProps = [
            'jsonUrl',
            'nodeId',
            'nodeVal',
            'nodeColor',
            'nodeAutoColorBy',
            'nodeOpacity',
            'linkSource',
            'linkTarget',
            'linkVisibility',
            'linkColor',
            'linkAutoColorBy',
            'linkOpacity',
            'linkWidth',
        ];

        fgProps
            .filter(function (p) { return p in diff; })
            .forEach(function (p) {
                if (p === "jsonUrl") {
                    elData[p] = "https://resources.realitymedia.digital/data/forcegraph/" + elData[p];
                }

                comp.forceGraph[p](elData[p] !== '' ? elData[p] : null);
            }); // Convert blank values into nulls

        this.forceGraph.nodeThreeObject(this.makeHTMLText);

        if (this.data.chargeForce != 0) {
            this.forceGraph.d3Force('charge').strength(this.data.chargeForce);
        }

        if (this.data.xForce !== 0) {
            this.forceGraph.d3Force('x').strength(this.data.xForce);
        }
        if (this.data.yForce !== 0) {
            this.forceGraph.d3Force('y').strength(this.data.yForce);
        }
        if (this.data.zForce !== 0) {
            this.forceGraph.d3Force('z').strength(this.data.zForce);
        }
    },

    // called by initTemplate() when the component is being processed.  Here, we create
    // the three.js objects we want, and add them to simpleContainer (an AFrame node 
    // the template created for us).
    initializeData: function () {
    },

    // called from remove() in the template to remove any local resources when the component
    // is destroyed
    remove: function () {
        this.simpleContainer.removeObject3D('forcegraphGroup');
        this.removeTemplate()
    },

    // handle "interact" events for clickable entities
    clicked: function (evt) {
        // the evt.target will point at the object3D in this entity.  We can use
        // handleInteraction.getInteractionTarget() to get the more precise 
        // hit information about which object3Ds in our object were hit.  We store
        // the one that was clicked here, so we know which it was as we drag around
        this.clickIntersection = this.handleInteraction.getIntersection(evt.object3D, [evt.target]);
        this.clickEvent = evt;

        if (!this.clickIntersection) {
            console.warn("click didn't hit anything; shouldn't happen");
            return;
        }

        // this.clickIntersection.object 
        // this.state.hoverObj && this.data['on' + (this.state.hoverObj.__graphObjType === 'node' ? 'Node' : 'Link') + 'Click'](this.state.hoverObj.__data)
    },

    // called to start the drag.  Will be called after clicked() if isDraggable is true
    dragStart: function (evt) {
        // set up the drag state
        if (!this.handleInteraction.startDrag(evt)) {
            return
        }

        // // grab a copy of the current orientation of the object we clicked
        // if (this.clickIntersection.object == this.box) {
        //     this.initialEuler.copy(this.box.rotation)
        // } else if (this.clickIntersection.object == this.box2) {
        //     this.box2.material.color.set("red")
        // }
    },

    // called when the button is released to finish the drag
    dragEnd: function (evt) {
        this.handleInteraction.endDrag(evt)
        // if (this.clickIntersection.object == this.box) {} else if (this.clickIntersection.object == this.box2) {
        //     this.box2.material.color.set("black")
        // }
    },

    // the method setSharedData() always sets the shared data, causing a network update.  
    // We can be smarter here by calling it only when significant changes happen, 
    // which we'll do in the setSharedEuler methods
    // setSharedEuler: function (newEuler) {
    //     if (!almostEqualVec3(this.sharedData.rotation, newEuler, 0.05)) {
    //         this.sharedData.rotation.copy(newEuler)
    //         this.setSharedData()
    //     }
    // },
    // setSharedPosition: function (newPos) {
    //     if (!almostEqualVec3(this.sharedData.position, newPos, 0.05)) {
    //         this.sharedData.position.copy(newPos)
    //         this.setSharedData()
    //     }
    // },

    // if the object is networked, this.stateSync will exist and should be called
    setSharedData: function () {
        if (this.stateSync) {
            return this.stateSync.setSharedData(this.sharedData)
        }
        return true
    },

    // this is called from the networked data entity to get the initial data 
    // from the component
    getSharedData: function () {
        return this.sharedData
    },

    // per frame stuff
    cameraMatrix: new THREE.Matrix4(),
    cameraQuaternion: new THREE.Quaternion(),
    nodeQuaternion: new THREE.Quaternion(),

    tick: function (time) {
        const state = this.state;
        const props = this.data;

        // if it's interactive, we'll handle drag and hover events
        if (this.isInteractive) {

            // if we're dragging, update the rotation
            if (this.isDraggable && this.handleInteraction.isDragging) {

                // do something with the dragging. Here, we'll use delta.x and delta.y
                // to rotate the object.  These values are set as a relative offset in
                // the plane perpendicular to the view, so we'll use them to offset the
                // x and y rotation of the object.  This is a TERRIBLE way to do rotate,
                // but it's a simple example.
                // if (this.clickIntersection.object == this.box) {
                //     // update drag state
                //     this.handleInteraction.drag()

                //     // compute a new rotation based on the delta
                //     this.box.rotation.set(this.initialEuler.x - this.handleInteraction.delta.x,
                //         this.initialEuler.y + this.handleInteraction.delta.y,
                //         this.initialEuler.z)

                //     // update the shared rotation
                //     this.setSharedEuler(this.box.rotation)
                // } else if (this.clickIntersection.object == this.box2) {

                // we want to hit test on our boxes, but only want to know if/where
                // we hit the big box.  So first hide the small box, and then do a
                // a hit test, which can only result in a hit on the big box.  
                // this.box2.visible = false
                // let intersect = this.handleInteraction.getIntersection(this.handleInteraction.dragInteractor, [this.box])
                // this.box2.visible = true

                // // if we hit the big box, move the small box to the position of the hit
                // if (intersect) {
                //     // the intersect object is a THREE.Intersection object, which has the hit point
                //     // specified in world coordinates.  So we move those coordinates into the local
                //     // coordiates of the big box, and then set the position of the small box to that
                //     let position = this.box.worldToLocal(intersect.point)
                //     this.box2.position.copy(position)
                //     this.setSharedPosition(this.box2.position)
                // }
                // }
            } else {
                // do something with the rays when not dragging or clicking.
                // For example, we could display some additional content when hovering
                let passthruInteractor = this.handleInteraction.getInteractors(this.simpleContainer);

                // we will set yellow if either interactor hits the box. We'll keep track of if
                // one does
                let setIt = false;

                // for each of our interactors, check if it hits the scene
                for (let i = 0; i < passthruInteractor.length; i++) {
                    let intersection = this.handleInteraction.getIntersection(passthruInteractor[i], this.simpleContainer.object3D.children)

                    // // if we hit the small box, set the color to yellow, and flag that we hit
                    // if (intersection && intersection.object === this.box2) {
                    //     this.box2.material.color.set("yellow")
                    //     setIt = true
                    // }
                }

                // if we didn't hit, make sure the color remains black
                // if (!setIt) {
                //     this.box2.material.color.set("black")
                // }
            }
        }

        if (this.isNetworked) {
            // if we haven't finished setting up the networked entity don't do anything.
            if (!this.netEntity || !this.stateSync) {
                return
            }

            // if the state has changed in the networked data, update our html object
            if (this.stateSync.changed) {
                this.stateSync.changed = false

                // got the data, now do something with it
                let newData = this.stateSync.dataObject
                // this.sharedData.color.set(newData.color)
                // this.sharedData.rotation.copy(newData.rotation)
                // this.sharedData.position.copy(newData.position)
                // this.box.material.color.set(newData.color)
                // this.box.rotation.copy(newData.rotation)
                // this.box2.position.copy(newData.position)
            }
        }

        // Run force-graph ticker
        this.forceGraph.tickFrame();

        let ns = this.forceGraph.graphData()
        
        // need to force this or we'll get the one from last frame
        // which will cause the graph to swim when the head moves
        this.el.sceneEl.camera.updateMatrices();
        this.el.sceneEl.camera.getWorldQuaternion(this.cameraQuaternion)

        this.forceGraph.getWorldQuaternion(this.nodeQuaternion).invert().multiply(this.cameraQuaternion);

        ns.nodes.forEach((node) => {
            // might not be created yet
            node.__threeObj && node.__threeObj.quaternion.copy( this.nodeQuaternion );

            if (node._box) {
                node._box.rotation.z += 0.03
                //node._box.matrixNeedsUpdate = true
            }

            node.htmlGenerator && node.htmlGenerator.tick(time)

            // if node.__threeObj isn't created, or it is and box hasn't yet been removed,
            // we will tick
           // if ((node._box || !node.__threeObj) && node.htmlGenerator) {
            //   node.htmlGenerator.tick(time)
           // }  
        }) 
        this.forceGraph.traverseVisible(function (node) {
            node.matrixNeedsUpdate = true;
        })

        if (this.running) {
            this.scaleToFit();
        }
    }
}

// register the component with the AFrame scene
AFRAME.registerComponent(componentName, {
    ...child,
    ...template
})

// create and register the data component and it's NAF component with the AFrame scene
registerSharedAFRAMEComponents(componentName)