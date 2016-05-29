window.addEventListener('DOMContentLoaded', function () {
	var draglag = Draglag(document.querySelector('main'));
	var instructions = document.querySelector('.instructions');
	var annotations = document.querySelector('.annotations');
	var capabilitiesList = document.querySelector('.capabilities');
	annotations.style.opacity = 0;
	draglag.on('didTestTouchCapabilities', function (capabilities) {
		document.querySelector('.js-input-device').textContent =
			capabilities.isTouchDevice ? 'finger' : 'cursor';
		function yesno(title, bool) {
			if (bool) return '<dt class="yes">' + title + '</dt><dd>yes</dd>';
			else return '<dt class="no">' + title + '</dt><dd>no</dd>';
		}
		capabilitiesList.innerHTML = [
			yesno('is touch device', capabilities.isTouchDevice),
			yesno('radius', capabilities.radius),
			yesno('rotationAngle', capabilities.rotationAngle),
			yesno('force', capabilities.force),
		].join('\n');
	});
	draglag.on('start', function () {
		annotations.style.opacity = 1;
		instructions.style.opacity = 0;
	});
})
function Draglag(element) {
	// Constants
	var CLICK = 'CLICK';
	var TOUCH = 'TOUCH';
	var PSEUDO_TOUCH_IDENTIFIER = 'PSEUDO_TOUCH_IDENTIFIER';

	var canvas = document.createElement('canvas');
	var ctx = canvas.getContext('2d');
	canvas.style.width = '100%';
	canvas.style.height = '100%';

	canvas.addEventListener('touchstart', handleTouchStart);
	canvas.addEventListener('touchmove', handleTouchMove);
	canvas.addEventListener('touchend', handleTouchEnd);

	canvas.addEventListener('mousemove', handleMouseMove);

	var hasStarted = false;
	var initializationTime = Date.now();

	// Set up canvas drawing
	var width, height, s;
	element.appendChild(canvas);
	handleResize();
	window.addEventListener('resize', handleResize);
	requestAnimationFrame(drawLoop);

	// Set up the things we want to draw on the canvas
	var touches = [];
	var touchCapabilities = null;

	function draw() {
		ctx.clearRect(0, 0, width * s, height * s);
		for (var i = 0; i < touches.length; i++) {
			drawTouch(touches[i]);
		}
	}
	function drawTouch(touch) {
		ctx.fillStyle = '#333';
		var x = touch.x;
		var y = touch.y;
		var speed = touch.speed;

		ctx.beginPath();
		ctx.arc(x * s, y * s, 30 * s, 0, Math.PI * 2);
		ctx.closePath();
		ctx.fill();

		if (!speed || speed < 0.01) return;

		// If moving left, the semicircles will be open at the right, so we want
		// the labels to be left-aligned
		var align = (touch.dx > 0) ? 'right' : 'left';
		// The alignment sign will be multiplied into the label placement trig
		// functions to ensure that the labels are always placed at the top end of
		// the semicircles
		var alignmentSign = (touch.dx > 0) ? -1 : 1;
		ctx.textAlign = align;
		ctx.fillStyle = '#fff';
		ctx.font = (16 * s) + 'px -apple-system, "Helvetica Neue", sans-serif';
		ctx.strokeStyle = '#fff';
		ctx.lineWidth = s * 2;
		var millisecondCircles = [ 50, 100, 150 ];
		// Draw a semicircle at each of the millisecond distances specified above
		millisecondCircles.forEach(function (ms) {
			var r = speed * ms;
			// Find the offset of the label at the end of the semicircle
			var dxLabel = r * Math.cos(touch.direction + alignmentSign * Math.PI / 2);
			var dyLabel = r * Math.sin(touch.direction + alignmentSign * Math.PI / 2);
			dxLabel += (align === 'left') ? 4 : -4;
			dyLabel += 4;
			ctx.beginPath();
			ctx.arc(x * s, y * s, r * s, touch.direction - Math.PI / 2, touch.direction + Math.PI / 2);
			ctx.stroke();
			ctx.closePath();
			ctx.fillText(ms + ' ms', (x + dxLabel) * s, (y + dyLabel) * s);
		});
	}
	function drawLoop() {
		if (touches.length) draw();
		requestAnimationFrame(drawLoop);
	}

	// Test what attributes are present in the Touch objects
	function testTouchCapabilities(ev) {
		var isTouchDevice;
		var radius = false;
		var rotationAngle = false;
		var force = false;

		isTouchDevice = !!(ev.touches && ev.touches[0]);
		var touch;
		if (isTouchDevice) {
			touch = ev.touches[0];
			radius = touch.radiusX !== undefined && touch.radiusY !== undefined;
			rotationAngle = touch.rotationAngle !== undefined;
			force = touch.force !== undefined;
		}
		var capabilities = {
			isTouchDevice: isTouchDevice,
			radius: radius,
			rotationAngle: rotationAngle,
			force: force,
		}
		trigger('didTestTouchCapabilities', capabilities);
		return capabilities;
	}

	var touchList = (function () {
		var touchHistory = {};

		function addToTouchHistory(touch) {
			var history = touchHistory[touch.id];
			if (!history) {
				history = [ touch ];
				touchHistory[touch.id] = history;
			} else {
				history.unshift(touch);
			}
		}
		function getFromTouchHistory(touch, index, acceptEarlierTouch) {
			if (index === undefined) index = 0;
			var history = (touchHistory[touch.id] || []);
			if (acceptEarlierTouch) {
				index = Math.min(history.length - 1, index);
			}
			return history[index];
		}

		function getDx(touch, previousTouch) {
			if (!previousTouch) return null;
			return touch.x - previousTouch.x;
		}
		function getDy(touch, previousTouch) {
			if (!previousTouch) return null;
			return touch.y - previousTouch.y;
		}
		function getSpeed(touch, previousTouch) {
			if (!previousTouch) return null;

			var dx = touch.x - previousTouch.x;
			var dy = touch.y - previousTouch.y;
			var dt = touch.timestamp - previousTouch.timestamp;
			var distance = Math.sqrt(dx * dx + dy * dy);
			var speed = distance / dt;
			return speed;
		}
		function getDirection(touch, previousTouch) {
			if (!previousTouch) return null;

			var dx = touch.x - previousTouch.x;
			var dy = touch.y - previousTouch.y;
			var atan = Math.atan(dy / dx);
			if (dx < 1) atan += Math.PI;
			return atan;
		}

		function makeTouchList(ev) {
			var touches = [];
			var touch, previousTouch;
			var now = Date.now();

			if (!touchCapabilities.isTouchDevice) {
				touch = {
					x: ev.clientX,
					y: ev.clientY,
					type: CLICK,
					id: PSEUDO_TOUCH_IDENTIFIER,
					timestamp: now,
				};
				previousTouch = getFromTouchHistory(touch, 20, true);
				touch.dx = getDx(touch, previousTouch);
				touch.dy = getDy(touch, previousTouch);
				touch.speed = getSpeed(touch, previousTouch);
				touch.direction = getDirection(touch, getFromTouchHistory(touch, 2, true));
				addToTouchHistory(touch);
				return [ touch ];
			}

			for (var i = 0; i < ev.touches.length; i++) {
				touch = {
					x: ev.touches[i].clientX,
					y: ev.touches[i].clientY,
					type: TOUCH,
					id: ev.touches[i].identifier,
					speed: null,
					timestamp: now,
				};
				previousTouch = getFromTouchHistory(touch, 20, true);
				touch.dx = getDx(touch, previousTouch);
				touch.dy = getDy(touch, previousTouch);
				touch.speed = getSpeed(touch, previousTouch);
				touch.direction = getDirection(touch, getFromTouchHistory(touch, 2, true));
				addToTouchHistory(touch);
				touches.push(touch);
			}

			return touches;
		}

		function clearTouchList() {
			touchHistory = {};
			return [];
		}

		return {
			make: makeTouchList,
			clear: clearTouchList,
		}
	})();

	// Event handlers
	function handleTouchStart(ev) {
		if (!touchCapabilities) touchCapabilities = testTouchCapabilities(ev);
		ev.preventDefault();
		touches = touchList.make(ev);
	}
	function handleTouchMove(ev) {
		if (!hasStarted) {
			trigger('start');
			hasStarted = true;
		}
		ev.preventDefault();
		touches = touchList.make(ev);
	}
	function handleTouchEnd() {
		touches = touchList.clear();
	}
	var mouseMoveTimeout;
	function handleMouseMove(ev) {
		if (!touchCapabilities) touchCapabilities = testTouchCapabilities(ev);
		if (touchCapabilities.isTouchDevice) return;
		if (!hasStarted && Date.now() - initializationTime > 500) {
			trigger('start');
			hasStarted = true;
		}
		ev.preventDefault();
		touches = touchList.make(ev);
		clearTimeout(mouseMoveTimeout);
		mouseMoveTimeout = setTimeout(function () {
			touches = touchList.clear();
		}, 1000);
	}
	function handleResize() {
		var rect = canvas.getBoundingClientRect();
		s = window.devicePixelRatio || 1;
		width = rect.width;
		height = rect.height;
		canvas.width = width * s;
		canvas.height = height * s;
	}

	// Boilerplate for custom events
	var eventListeners = {};
	function addListener(event, listener) {
		if (!eventListeners[event]) eventListeners[event] = [ listener ];
		else eventListeners[event].push(event);
	}
	function removeListener(event, listener) {
		if (!eventListeners[event]) throw new Error('No listeners for event ' + event);
		eventListeners[event] = eventListeners.event.filter(function(l) { return l !== listener });
	}
	function trigger(event, data) {
		var listeners = eventListeners[event];
		if (!listeners) return;
		for (var i = 0; i < listeners.length; i++) {
			listeners[i](data);
		}
	}

	return {
		on: addListener,
		off: removeListener,
	}
}
