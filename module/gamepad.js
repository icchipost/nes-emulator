export function Gamepad() {
	//$4016
	this.strobe = 0;
	this.expansionPort = 0;

	this.controllerPort1Latch = 0;
	this.controllerPort1Shfit = 0;

	this.controllerPort2Latch = 0;
	this.controllerPort2Shift = 0;

	this.write = function(address, data) {
		this.strobe = data & 1;
		this.expansionPort = (data >> 1) & 3;
		if (this.strobe) {
			this.controllerPort1Latch = controllerPort1;
			this.controllerPort1Shfit = 0;

			this.controllerPort2Latch = controllerPort1;
			this.controllerPort2Shfit = 0;
		}
	}

	this.read = function(address) {
		let res = 0;
		if (address === 0x4016) {
			//コントローラポート1
			//console.log("read controller port 1");
			res |= ((this.controllerPort1Latch >> this.controllerPort1Shfit) & 1) << 0;
			if (this.controllerPort1Shfit >= 8) res = 1;
			this.controllerPort1Shfit++;
		}
		else if (address === 0x4017) {
			//コントローラポート2
			//console.log("read controller port 2");
			res |= ((this.controllerPort2Latch >> this.controllerPort2Shfit) & 1) << 0;
			if (this.controllerPort2Shfit >= 8) res = 1;
			this.controllerPort2Shfit++;
		}
		
		return res;
	}
}

let controllerPort1 = 0;
document.addEventListener("keydown", (e) => {
	if (e.code === "KeyZ") controllerPort1 |= (1 << 0);
	if (e.code === "KeyX") controllerPort1 |= (1 << 1);
	if (e.code === "KeyC") controllerPort1 |= (1 << 2);
	if (e.code === "KeyV") controllerPort1 |= (1 << 3);
	if (e.code === "ArrowUp") controllerPort1 |= (1 << 4);
	if (e.code === "ArrowDown") controllerPort1 |= (1 << 5);
	if (e.code === "ArrowLeft") controllerPort1 |= (1 << 6);
	if (e.code === "ArrowRight") controllerPort1 |= (1 << 7);
});

document.addEventListener("keyup", (e) => {
	if (e.code === "KeyZ") controllerPort1 &= ~(1 << 0);
	if (e.code === "KeyX") controllerPort1 &= ~(1 << 1);
	if (e.code === "KeyC") controllerPort1 &= ~(1 << 2);
	if (e.code === "KeyV") controllerPort1 &= ~(1 << 3);
	if (e.code === "ArrowUp") controllerPort1 &= ~(1 << 4);
	if (e.code === "ArrowDown") controllerPort1 &= ~(1 << 5);
	if (e.code === "ArrowLeft") controllerPort1 &= ~(1 << 6);
	if (e.code === "ArrowRight") controllerPort1 &= ~(1 << 7);
});
