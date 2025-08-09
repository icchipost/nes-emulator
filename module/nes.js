import { CPU } from "./cpu.js";
import { PPU } from "./ppu.js";
import { APU } from "./apu.js";
import { Gamepad } from "./gamepad.js";
import { Cartridge } from "./cartridge.js";

export function NES() {
	this.cpu = new CPU();
	this.ppu = new PPU();
	this.apu = new APU();
	this.gamepad = new Gamepad();
	this.cartridge = new Cartridge();

	this.requestID = 0;
	this.frame = 0;

	this.reset = function() {
		this.stop();
		this.cpu.softwareReset();
		this.ppu.reset();
		this.apu.reset();
		this.run();
	}

	this.load = function(result) {
		this.cartridge.init(result);

		this.cpu.setPPU(this.ppu);
		this.cpu.setAPU(this.apu);
		this.cpu.setGamepad(this.gamepad);
		this.cpu.setCartridge(this.cartridge);

		this.ppu.setCPU(this.cpu);
		this.ppu.init();
		this.ppu.setCartridge(this.cartridge);

		this.apu.powerup(this.cpu);

		this.cpu.hardwareReset();
	}
	
	this.prevTimestamp = 0;
	this.run = function() {
		//console.clear();
		//console.log(`----- frame ${this.frame}  ----- `);

		//1フレームのサイクル数(奇数フレーム時は+1？)
		const frameCycle = 29780 + (this.frame & 2);

		for (let i = 0; i < frameCycle; i++) {
			this.cpu.run(i, this.frame);
			this.ppu.run(i);
			this.ppu.run(i);
			this.ppu.run(i);
			this.apu.run(i);
		}
		this.frame++;
		this.ppu.render();
		//if (this.frame % 60 === 0) this.ppu.debugRender();
		this.requestID = window.requestAnimationFrame(this.run.bind(this));
	}

	this.stop = function() {
		if (this.requestID) {
			cancelAnimationFrame(this.requestID);
		}
	}
}
