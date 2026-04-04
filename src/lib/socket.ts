import { io } from "socket.io-client";

const socket = io(window.location.origin, {
  autoConnect: false,
});

export default socket;
