/* global console, std */
import {
  Drone,
  triggerParachute,
  getAltitude,
  getAltitudeRel,
  getInitialAltitude,
  getLatitude,
  getLongitude,
  getYaw,
  initPubsub,
  isInManualMode,
  landed,
  loiter,
  setAirspeed,
  setAltitude,
  setManualControlInput,
  setMessage,
  setTargetCoordinates
} from "{{ qjs_wrapper }}";
import * as std from "std";
import { Worker } from "os";

(function (console, Worker) {
  // Every script is evaluated per drone
  "use strict";
  const drone_dict = {},
    drone_id_list = [{{ drone_id_list }}],
    IS_A_DRONE = {{ 'true' if is_a_drone else 'false' }};

  let parent = Worker.parent,
    user_me = {
      //for debugging purpose
      fdopen: std.fdopen,
      in: std.in,
      //required to fly
      triggerParachute: triggerParachute,
      drone_dict: {},
      exit: function(exit_code) {
        parent.postMessage({type: "exited", exit: exit_code});
        parent.onmessage = null;
      },
      getAltitudeAbs: getAltitude,
      getCurrentPosition: function() {
        return {
          x: getLatitude(),
          y: getLongitude(),
          z: getAltitudeRel()
        };
      },
      getInitialAltitude: getInitialAltitude,
      getYaw: getYaw,
      id: {{ id }},
      landed: landed,
      loiter: loiter,
      sendMsg: function(msg, id = -1) {
        setMessage(JSON.stringify({ content: msg, dest_id: id }));
      },
      setAirspeed: setAirspeed,
      setAltitude: setAltitude,
      setTargetCoordinates: setTargetCoordinates
    };

  function loadUserScript(path) {
    let script_content = std.loadFile(path);
    if (script_content === null) {
      console.log("Failed to load user script " + path);
      std.exit(1);
    }
    try {
      std.evalScript(
        "function execUserScript(from, me) {" +
          script_content +
        "};"
      );
    } catch (e) {
      console.log("Failed to evaluate user script", e);
      std.exit(1);
    }
    execUserScript(null, user_me);

    // Call the drone onStart function
    if (user_me.hasOwnProperty("onStart")) {
      user_me.onStart();
    }
  }

  function handleMainMessage(evt) {
    let type = evt.data.type,
      message,
      drone_id;

    if (type === "initPubsub") {
      initPubsub(drone_id_list.length);
      for (let i = 0; i < drone_id_list.length; i++) {
        drone_id = drone_id_list[i];
        user_me.drone_dict[drone_id] = new Drone(drone_id);
        user_me.drone_dict[drone_id].init(i);
      }
      parent.postMessage({type: "initialized"});
    } else if (type === "load") {
      loadUserScript(evt.data.path);
      parent.postMessage({type: "loaded"});
    } else if (type === "update") {
      for (const [id, drone] of Object.entries(user_me.drone_dict)) {
        message = drone.message
        if (message.length > 0) {
          message = JSON.parse(message);
          if (user_me.id === id) {
            continue;
          }
          if (user_me.hasOwnProperty("onGetMsg") &&
              [-1, user_me.id].includes(message.dest_id)) {
            user_me.onGetMsg(message.content);
          }
        }
      }
      // Call the drone onStart function
      if (user_me.hasOwnProperty("onUpdate")) {
        if (IS_A_DRONE && isInManualMode()) {
          setManualControlInput();
        }
        user_me.onUpdate(evt.data.timestamp);
      }
      parent.postMessage({type: "updated"});
    } else {
      throw new Error("Unsupported message type", type);
    }
  }

  parent.onmessage = function (evt) {
    try {
      handleMainMessage(evt);
    } catch (error) {
      // Catch all potential bug to exit the main process
      // if it occurs
      console.log(error);
      std.exit(1);
    }
  };
}(console, Worker));