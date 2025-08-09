const canvas = document.querySelector(".myCanvas");
const ctx = canvas.getContext("2d");

const canvasPatterntable = document.querySelector(".patterntable");
const contextPatterntable = canvasPatterntable.getContext("2d");

const canvasPaletteRAM = document.querySelector(".paletteRAM");
const contextPaletteRAM = canvasPaletteRAM.getContext("2d");

const canvasNametable = document.querySelector(".nametable");
const contextNametable = canvasNametable.getContext("2d");

const canvasSpritelist = document.querySelector(".spritelist");
const contextSpritelist = canvasSpritelist.getContext("2d");

export function PPU() {
	//レジスタ
	this.registers = {
		ppuctrl:    0x00,
		ppumask:    0x00,
		ppustatus:  0x00,
		oamaddr:    0x00,
		oamdata:    0x00,
		ppuscroll:  0x00,
		ppuaddr:    0x00,
		ppudata:    0x00,
		oamdma:     0x00,
	};

	//ppudata読み取り時に返される内部バッファ
	this.ppudataBuffer = 0;

	//this.ROM = new Array(0x2000).fill(0);
	//this.RAM = new Array(0x0800).fill(0);
	this.RAM = new Uint8Array(0x0800);

	//this.paletteRAM = new Array(32).fill(0);
	this.paletteRAM = new Uint8Array(32);
	// this.paletteRAM = [
	// 	0x09, 0x01, 0x00, 0x01, 0x00, 0x02, 0x02, 0x0d, 0x08, 0x10, 0x08, 0x24, 0x00, 0x00, 0x04, 0x2c,
	// 	0x09, 0x01, 0x34, 0x03, 0x00, 0x04, 0x00, 0x14, 0x08, 0x3a, 0x00, 0x02, 0x00, 0x20, 0x2c, 0x08
	// ];

	this.cpu = undefined;
	this.cartridge = undefined;

	//0:垂直 1:水平
	this.nametableMirroringMode;

	//オープンバス
	this.IOBusLatchValue = 0;
	this.memoryBusLatchValue = 0;

	this.palette = [
		[97, 97, 97], [0, 30, 179], [36, 4, 199], [83, 0, 179],
		[113, 0, 117], [128, 0, 36], [115, 11, 0], [82, 39, 0],
		[37, 69, 0], [0, 87, 0], [0, 92, 0], [0, 84, 36],
		[0, 61, 117], [0, 0, 0], [0, 0, 0], [0, 0, 0],

		[171, 171, 171], [13, 85, 255], [136, 18, 255], [270, 100, 53],
		[187, 9, 214], [109, 19, 104], [199, 46, 0], [158, 84, 0],
		[96, 122, 0], [33, 153, 0], [0, 163, 0], [0, 153, 66],
		[0, 127, 181], [0, 0, 0], [0, 0, 0], [0, 0, 0],

		[255, 255, 255], [84, 175, 255], [143, 133, 255], [212, 102, 255],
		[255, 87, 255], [255, 92, 206], [255, 118, 87],  [250, 158, 0],
		[189, 199, 0], [124, 232, 0], [66, 245, 17], [38, 240, 126],
		[44, 211, 245], [79, 79, 79], [0, 0, 0], [0, 0, 0],

		[255, 255, 255], [181, 224, 255], [207, 210, 255], [233, 194, 255],
		[255, 189, 255], [255, 189, 244], [255, 197, 194], [255, 213, 153],
		[232, 229, 128], [206, 245, 130], [180, 250, 152], [170, 250, 195],
		[169, 241, 245], [184, 184, 184], [0, 0, 0], [0, 0, 0]
	];

	this.init = function() {
		this.width = canvas.width;
		this.height = canvas.height;
		this.imageData = ctx.createImageData(this.width, this.height);

		this.imageDataPatterntable = contextPatterntable.createImageData(8, 8);
		this.imageDataPaletteRAM = contextPaletteRAM.createImageData(8, 8);
		this.imageDataNametable = contextNametable.createImageData(8, 8);
		this.imageDataSpritelist = contextSpritelist.createImageData(8, 8);
	}

	this.reset = function() {
		this.registers.ppuctrl = 0x00;
		this.registers.ppumask = 0x00;
		this.internalRegisters.w = 0;
		this.registers.ppuscroll = 0x0000;
		this.registers.ppudata = 0x00;

		this.resetFlag = 1;
	}

	this.setCPU = function(cpu) {
		this.cpu = cpu;
	}

	this.setCartridge = function(cartridge) {
		this.cartridge = cartridge;
	}

	this.pollingInterrupt = function() {
		const res = this.assertNMI;
		this.assertNMI = 0;
		return res;
	}

	this.readMemory = function(address) {
		if (address <= 0x1fff) {
			//パターンテーブル#0-1
			const A12 = (address >> 12) & 1;
			if (!this.prevA12 && A12) {
				//this.cartridge.mapper.updateIRQCounter();
				this.cartridge.update();
				//console.log("readMemory()", this.prevA12, A12);
			}
			this.prevA12 = A12;
			
			const res = this.cartridge.readCHRROM(address);
			//console.log(`$${address.toString(16).padStart(4, 0)}=$${res.toString(2).padStart(8, 0)}`);
			return this.cartridge.readCHRROM(address);
		}
		else if (address <= 0x3EFF) {
			//$2000-$23FF：ネームテーブル#0
			//$2400-$27FF：ネームテーブル#1
			//$2800-$2BFF：ネームテーブル#2
			//$C400-$2FFF：ネームテーブル#3
			//$3000-$3EFF：上記ミラー領域

			const mirroringMode = this.cartridge.getMirroringMode();
			if (mirroringMode === "horizontal") {
				//ネームテーブル#0と#1、#2と#3がミラー
				//アドレス線のビット10がNC
				let a = address & 0xBFF;
				if ((a >> 11) & 1) a -= 0x400;
				return this.RAM[a];
			}
			else if (mirroringMode === "vertical") {
				//ネームテーブル#0と#2、#1と#3がミラー
				//アドレス線のビット11がNC
				let a = address & 0x7FF;
				return this.RAM[a];
			}
			else if (mirroringMode === "single") {
				//ネームテーブル#0と#1、#2、#3がミラー
				//アドレス線のビット10、11がNC
				let a = address & 0x3FF;
				return this.RAM[a];
			}
		}
		else if (address <= 0x3fff) {
			//パレットRAM
			//各パレットのエントリ0は透明(=背景色)
			//パレット0のエントリ0が背景色として使用される
			let a = address & 0x3F1F;

			if ((a & 3) === 0) {
				//背景色(パレット0のエントリ0)
				a = 0x3F00;
			}
			
			return this.paletteRAM[a - 0x3F00];
		}
	}

	this.writeMemory = function(address, data) {
		//console.log(address.toString(16).padStart(4, 0), data.toString(2).padStart(8, 0));

		if (address <= 0x1fff) {
			//パターンテーブル#0
			//this.ROM[address] = data;
			//console.log(`CHR ROM Write!!!!! ${address.toString(16).padStart(4, 0)}:${data.toString(2).padStart(8, 0)}`);
			
			this.cartridge.writeCHRROM(address, data);
		}
		else if (address <= 0x3EFF) {
			//$2000-$23FF：ネームテーブル#0
			//$2400-$27FF：ネームテーブル#1
			//$2800-$2BFF：ネームテーブル#2
			//$C400-$2FFF：ネームテーブル#3
			//$3000-$3EFF：上記ミラー領域

			const mirroringMode = this.cartridge.getMirroringMode();
			
			if (mirroringMode === "horizontal") {
				//ネームテーブル#0と#1、#2と#3がミラー
				//アドレス線のビット10がNC
				let a = address & 0xBFF;
				if ((a >> 11) & 1) a -= 0x400;
				this.RAM[a] = data;
			}
			else if (mirroringMode === "vertical") {
				//ネームテーブル#0と#2、#1と#3がミラー
				//アドレス線のビット11がNC
				let a = address & 0x7FF;
				this.RAM[a] = data;
			}
			else if (mirroringMode === "single") {
				//ネームテーブル#0と#1、#2、#3がミラー
				//アドレス線のビット10、11がNC
				let a = address & 0x3FF;
				this.RAM[a] = data;
				this.RAM[a + 0x400] = data;
			}
		}
		else if (address <= 0x3fff) {
			//パレットRAM
			
			/*
				各パレットのエントリ0は背景とスプライト共有される
				($3F00と$3F10、$3F04と$3F14...のように両方を通じて書き込める)

				パレットRAM全体は$3F00-$3FFF領域全体でミラーリングされる
				(パレットRAMは$3F00-$3F1F)
			*/
			let a = address & 0x3F1F;
			let bgColor = 0;
			
			if ((a & 3) === 0) {
				bgColor = 1;
				a &= 0x3F0C;
			}

			//ミラーリング(0x3F00-0x3FFF)
			if (bgColor) {
				//背景色は背景とスプライト共有
				for (let i = 0; i < 16; i++) {
					const paletteRAMIndex = a + i * 16 - 0x3F00;
					this.paletteRAM[paletteRAMIndex] = data & 0x3F;
				}
			}
			else {
				for (let i = 0; i < 8; i++) {
					const paletteRAMIndex = a + i * 32 - 0x3F00;
					this.paletteRAM[paletteRAMIndex] = data & 0x3F;
				}
			}

			//console.log(address.toString(16).padStart(4, 0), data);
		}
	}

	this.internalRegisters = {
		v: 0x00,
		t: 0x00,
		x: 0x00,
		w: 0x00,
	};

	//PPUMASK $2001
	this.enableBG = 0;
	this.enableSprite = 0;

	//cpu-ppuのクロックアライメント用
	//ppustatusリード時のスキャンライン・サイクルを保存
	//vbl発生時のスキャンライン・サイクルと比較して、
	//vblankフラグのセット及び、nmi発生可否を判断する
	//その後、スキャンライン・サイクルを0に初期化する
	this.ppustatusReadTiming = {
		scnaline: 0,
		cycle: 0
	};

	this.readRegisters = function(address) {
		switch (address) {
			case 0x2002: {
				//cpu-ppuアライメント用
				{
					if (this.cycle === 0) {
						this.ppustatusReadTiming.scanline = this.scanline - 1;
						this.ppustatusReadTiming.cycle = 341;
					}
					else {
						this.ppustatusReadTiming.scanline = this.scanline;
						this.ppustatusReadTiming.cycle = this.cycle - 1;
					}
				}

				//リード時、VBLフラグをクリア
				const res = this.registers.ppustatus;
				this.registers.ppustatus &= ~0x80;

				this.internalRegisters.w = 0;
				//console.log(this.scanline, this.cycle, "wレジスタクリア");
				
				this.IOBusLatchValue = (this.IOBusLatchValue & 0xE0) | res;
				return res;
			}
			case 0x2004: {
				const res = this.OAM[this.registers.oamaddr];
				this.IOBusLatchValue = res;
				return this.registers.oamdata = res;
			}
			case 0x2007: {
				let res = this.ppudataBuffer;
				
				if (0x3f00 <= this.registers.ppuaddr && this.registers.ppuaddr <= 0x3fff) {
					//パレットRAM読み取り時はすぐに返される
					//また、バッファにはVRAMの$3f00～$3fff(ネームテーブルのミラー$2f00～$2fff)が格納される
					res = this.readMemory(this.registers.ppuaddr);
					this.ppudataBuffer = this.readMemory(this.registers.ppuaddr - 0x1000);
				}
				else {
					this.ppudataBuffer = this.readMemory(this.registers.ppuaddr);
				}

				this.registers.ppuaddr += (this.registers.ppuctrl & 0x04 ? 32 : 1);

				if ((0 <= this.scanline && this.scanline <= 239) || this.scanline === 261) {
					this.updateXScroll();
					this.updateYScroll();
				}
				else {
					if ((this.registers.ppuctrl >> 2) & 1) {
						this.internalRegisters.v += 32;
					}
					else {
						this.internalRegisters.v++;
					}
				}

				{
					//A12の立ち上がりでIRQカウンターをクロック(mapper#4)
					const A12 = (this.registers.ppuaddr >> 12) & 1;
					if (!this.prevA12 && A12) {
						//this.cartridge.mapper.updateIRQCounter();
						this.cartridge.update();
						//console.log("readRegisters()", this.prevA12, A12);
					}
					this.prevA12 = A12;
				}

				//console.log(`[read $2007] ${address.toString(16)}:${res}`);
				this.IOBusLatchValue = res;
				return res;
			}

			default: {
				//console.log(address.toString(16), "is write only...?");
				return this.IOBusLatchValue;
			}
		}
	}

	this.prevA12 = 0;
	this.writeRegisters = function(address, data) {
		//if (address === 0x2000) console.log(this.scanline, this.cycle, address.toString(16).padStart(4, 0), data.toString(2).padStart(8, 0));

		switch (address) {
			case 0x2000: {	//PPUCTRL
				if (this.resetFlag === 1) break;

				{
					if ((data >> 7) & 1) {
						if ((~(this.registers.ppuctrl >> 7) & 1) &&
							((this.registers.ppustatus >> 7) & 1))
						{
							//vblankフラグがセットされた状態で
							//nmi割込み無効→有効化された場合、
							//nmi割込みを発生させる
							if (this.scanline === 261 && this.cycle === 1) {
								//vblank終了のため、nmi割込み発生しない
							}
							else if (this.scanline === 241 && (this.cycle === 1 || this.cycle === 2)) {
								//
							}
							else {
								//this.cpu.assertInterrupt("NMI");
								this.registers.ppuctrl |= (1 << 7);
								this.assertNMI = 1;
							}
						}
					}
				}

				this.registers.ppuctrl = data;
				const temp = this.internalRegisters.t & 0x73FF;
				const nametable = (data & 3) << 10;
				this.internalRegisters.t = temp | nametable;
				
				break;
			}
			case 0x2001: {	//PPUMASK
				if (this.resetFlag === 1) break;
				this.enableBG = (data >> 3) & 1;
				this.enableSprite = (data >> 4) & 1;
				this.registers.ppumask = data;

				//console.log("scanline:", this.scanline, " cycle:", this.cycle, " bg:", this.enableBG, " sprite:", this.enableSprite);
				break;
			}
			case 0x2002: {	//PPUSTATUS
				//read only
				//this.registers.ppustatus = data;
				//console.log("PPUSTATUS READ ONLY.");
				break;
			}
			case 0x2003: {	//OAMADDR
				this.registers.oamaddr = data;
				break;
			}
			case 0x2004: {	//OAMDATA
				this.OAM[this.registers.oamaddr] = this.registers.oamdata = data;
				this.registers.oamaddr++;
				this.registers.oamaddr &= 0xFF;
				break;
			}
			case 0x2005: {	//PPUSCROLL
				if (this.resetFlag === 1) break;

				this.registers.ppuscroll = data;

				if (this.internalRegisters.w === 0) {
					const temp = this.internalRegisters.t & 0x7FE0;
					const coarseX = (data >> 3) & 0x1F;
					this.internalRegisters.t = temp | coarseX;

					this.internalRegisters.x = data & 0x0007;
					this.internalRegisters.w = 1;

					//console.log(this.scanline, this.cycle, `X scroll:${data}`);
				}
				else {
					const temp = this.internalRegisters.t & 0x0C1F;
					const coarseY = (data & 0xF8) << 2;
					const fineY = (data & 0x07) << 12;
					this.internalRegisters.t = temp | coarseY | fineY;
					this.internalRegisters.w = 0;

					// console.log(this.scanline, this.cycle, `Y scroll:${data}`);
					// console.log("-----");
				}

				break;
			}
			case 0x2006: {	//PPUADDR
				if (this.resetFlag === 1) break;
				//console.log(`[writeRegistesr(PPUADDR)]$${data.toString(2).padStart(8, 0)}`);

				if (this.internalRegisters.w === 0) {
					
					{
						//A12の立ち上がりでIRQカウンターをクロック(mapper#4)
						const A12 = (data >> 4) & 1;
						if (!this.prevA12 && A12) {
							//this.cartridge.mapper.updateIRQCounter();
							this.cartridge.update();
							//console.log("writeRegisters()", this.prevA12, A12);
						}
						this.prevA12 = A12;
					}
					
					const addr = this.registers.ppuaddr & 0x00ff;
					this.registers.ppuaddr = addr | (data << 8);

					const temp = this.internalRegisters.t & 0x00FF;
					this.internalRegisters.t = temp | ((data & 0x003F) << 8);
					this.internalRegisters.w = 1;
				}
				else {
					const addr = this.registers.ppuaddr & 0xff00;
					this.registers.ppuaddr = addr | data;

					const temp = this.internalRegisters.t & 0x7F00;
					this.internalRegisters.t = temp | data;
					this.internalRegisters.v = this.internalRegisters.t;
					this.internalRegisters.w = 0;
				}
				
				break;
			}
			case 0x2007: {	//PPUDATA
				this.registers.ppudata = data;
				this.writeMemory(this.registers.ppuaddr, data);
				
				// {
				// 	let s = "[PPUDATA]"
				// 	s += "$" + this.registers.ppuaddr.toString(16).padStart(4, 0) + "\t";
				// 	s += ": $" + data.toString(16).padStart(4, 0);
				// 	console.log(s);
				// }
				
				//console.log(this.registers.ppuaddr.toString(16), data.toString(16));

				this.registers.ppuaddr += (this.registers.ppuctrl & 0x04 ? 32 : 1);

				if ((0 <= this.scanline && this.scanline <= 239) || this.scanline === 261) {
					this.updateXScroll();
					this.updateYScroll();
				}
				else {
					if ((this.registers.ppuctrl >> 2) & 1) {
						this.internalRegisters.v += 32;
					}
					else {
						this.internalRegisters.v++;
					}

					//console.log(`[writeRegistesr(PPUDATA)]v:$${this.internalRegisters.v.toString(16).padStart(4, 0)}`);
				}

				{
					//A12の立ち上がりでIRQカウンターをクロック(mapper#4)
					const A12 = (this.registers.ppuaddr >> 12) & 1;
					if (!this.prevA12 && A12) {
						//this.cartridge.mapper.updateIRQCounter();
						this.cartridge.update();
						//console.log("readRegisters()", this.prevA12, A12);
					}
					this.prevA12 = A12;
				}
				break;
			}
			case 0x4014: {
				this.cpu.assertOAMDMA(data);
				break;
			}
		}

		//オープンバス(I/Oバス)
		if (0x2000 <= address && address <= 0x3FFF) {
			this.IOBusLatchValue = data;
		}
	}

	this.resetFlag = 0;
	this.scanline = 0;
	this.cycle = 0;

	this.prevCycle = 0;
	this.oddFrameFlag = 0;

	this.assertNMI = 0;

	this.run = function(cpuCycle) {
		if (this.scanline <= 239) {
			if (1 <= this.cycle && this.cycle <= 256) {
				const [r, g, b] = this.generatePixel();
				this.drawPixel(this.cycle - 1, this.scanline, r, g, b);
			}
			else if (this.cycle === 261) {
				if (this.enableSprite || this.enableBG) {
					//スプライトの更新
					this.updateSprite();
				}
			}
		}
		else if (this.scanline === 241) {
			if (this.cycle === 1) {
				if (this.ppustatusReadTiming.scanline === 241 && this.ppustatusReadTiming.cycle === 0) {
					//vblankフラグのセット及び、nmiは発生しない
				}
				else {
					//VBlankフラグセット
					this.registers.ppustatus |= 0x80;
				}
			}
			else if (this.cycle === 3) {
				if (this.ppustatusReadTiming.scanline === 241) {
					if (this.ppustatusReadTiming.cycle === 0 || this.ppustatusReadTiming.cycle === 1 || this.ppustatusReadTiming.cycle === 2)
					{
						//nmiは発生しない
					}
					else {
						//VBlank NMI生成
						if ((this.registers.ppuctrl >> 7) & 1) {
							this.assertNMI = 1;
						}
					}
				}
				else {
					//VBlank NMI生成
					if ((this.registers.ppuctrl >> 7) & 1) {
						this.assertNMI = 1;
					}
				}
				this.ppustatusReadTiming.scanline = 0;
				this.ppustatusReadTiming.cycle = 0;
			}
		}
		else if (this.scanline === 261) {
			if (this.cycle === 1) {
				//VBlank NMI終了
				//vBlank NMI & スプライト0ヒット 解除
				this.registers.ppustatus &= ~0xe0;
				if (this.resetFlag) this.resetFlag = 0;
			}
			else if (257 <= this.cycle && this.cycle <= 320) {
				if (this.cycle === 260 && (this.enableSprite === 1 || this.enableBG === 1)) {
					//スプライトの更新
					this.updateSprite();
				}
			}
		}

		this.updateBG();
		this.updateScroll();

		this.cycle++;
		if (this.enableBG || this.enableSprite) {
			if (this.scanline === 261 && this.cycle === 340 && this.oddFrameFlag === 1) {
				this.cycle = 0;
				this.scanline = 0;
				this.oddFrameFlag ^= 1;
			}
			else if (341 <= this.cycle) {
				this.cycle = 0;
				this.scanline++;
				if (262 <= this.scanline) {
					this.scanline = 0;
					this.oddFrameFlag ^= 1;
				}
			}
		}
		else {
			if (341 <= this.cycle) {
				this.cycle = 0;
				this.scanline++;
				
				if (262 <= this.scanline) {
					this.scanline = 0;
					this.oddFrameFlag ^= 1;
				}
			}
		}
	}

	this.updateBG = function() {
		if (!this.enableBG) return;

		if (0 <= this.scanline && this.scanline <= 239) {
			if (1 <= this.cycle && this.cycle <= 256) {
				if ((this.cycle & 7) === 0) {
					this.loadPatternData();
				}
			}
			else if (321 <= this.cycle && this.cycle <= 336) {
				//next scanline
				if ((this.cycle & 7) === 0) {
					this.loadPatternData();
				}
			}
		}
		else if (this.scanline === 261) {
			if (321 <= this.cycle && this.cycle <= 336) {
				//next scanline
				if ((this.cycle & 7) === 0) {
					this.loadPatternData();
				}
			}
		}
	}

	//this.OAM = new Array(256);
	//this.OAMBuffer = new Array(256);
	//this.isExistOAM = new Array(256);
	//this.secOAM = new Array(32);

	this.OAM = new Uint8Array(256);
	this.OAMBuffer = new Uint16Array(256);
	this.secOAM = new Uint8Array(32);

	this.updateSprite = function() {
		//if (!this.enableSprite) return;

		let spriteSize = 8;
		if ((this.registers.ppuctrl >> 5) & 1) spriteSize = 16;

		for (let i = 0; i < 256; i++) {
			this.OAMBuffer[i] = 0;
		}
		//this.OAMBuffer.fill(0x00);
		//this.isExistOAM.fill(0);
		
		
		//1～64サイクル
		//セカンダリOAMの初期化
		//const secOAM = [];
		//const secOAM = new Array(32).fill(0xFF);
		//this.secOAM.fill(0xFF);
		for (let i = 0; i < 32; i++) {
			this.secOAM[i] = 0xFF;
		}

		//65～256サイクル
		//スプライトの評価
		let m = 0, si = 0;
		for (let n = 0; n < 256; n += 4) {
			let y = this.OAM[n];

			if (si === 32) {
				//オーバーフローフラグを設定
				y = this.OAM[n + m];
				if (y >= 0 && y <= this.scanline && this.scanline < y + spriteSize) {
					this.registers.ppustatus |= (1 << 5);
				}
				else {
					m = (m + 1) & 3;
				}
			}
			else {
				this.secOAM[si] = y;
				//if (y >= 0 && y <= this.scanline && this.scanline < y + spriteSize) {

				let flag = 1;
				if (y < 0) flag = 0;
				if (y > this.scanline) flag = 0;
				if (y + spriteSize <= this.scanline) flag = 0;

				if (flag) {
					this.secOAM[si + 1] = this.OAM[n + 1];
					this.secOAM[si + 2] = this.OAM[n + 2];
					this.secOAM[si + 3] = this.OAM[n + 3];
					si += 4;
				}
			}
		}

		
		
		//257～320サイクル
		//スプライトのフェッチ
		for (let i = 0; i < 32; i += 4) {
			const palette = this.secOAM[i + 2] & 0x03;
			const priority = (~this.secOAM[i + 2] & 0x20) >> 5;
			const flipX = (this.secOAM[i + 2] & 0x40) >> 6;
			const flipY = (this.secOAM[i + 2] & 0x80) >> 7;
			
			if (spriteSize === 8) {
				const bank = (this.registers.ppuctrl & 0x08) >> 3;
				const tileIndex = this.secOAM[i + 1];
				const PTAddr = (bank * 0x1000) + tileIndex * 16;

				const y = this.scanline - this.secOAM[i];
				const offsetY = (flipY ? 7 - y : y) & 7;
				let lower = this.readMemory(PTAddr + offsetY);
				let upper = this.readMemory(PTAddr + offsetY + 8);

				if (this.secOAM[i + 1] === 0xFF && this.secOAM[i + 2] === 0xFF && this.secOAM[i + 3] === 0xFF) {
					lower = upper = 0;
				}

				for (let j = 0; j < 8; j++) {
					const l = (lower >> j) & 1;
					const u = (upper >> j) & 1;
					const val = l + u * 2;
					const x = this.secOAM[i + 3] + (flipX ? j : 7 - j);
					
					//スプライトの優先順位
					//各x座標で最初に取得された不透明ピクセルを出力する
					if ((this.OAMBuffer[x] & 3) === 0) {
						this.OAMBuffer[x] = (priority << 4) + (palette << 2) + val;
						this.OAMBuffer[x] |= tileIndex << 5;
					}
					//this.isExistOAM[x] = 1;
				}
			}
			else if (spriteSize === 16) {
				//スプライトサイズが8x16の場合、ppuctrl[3]は無視される
				const bank = this.secOAM[i + 1] & 1;
				const tileIndex = this.secOAM[i + 1] >> 1;
				const PTAddr = (bank * 0x1000) + tileIndex * 0x20;

				const y = this.scanline - this.secOAM[i];
				let offsetY = (flipY ? 7 - y : y) & 7;
				if (y >= 8) offsetY = (flipY ? 7 - (y - 8) : (y - 8)) + 16;
				
				let lower = this.readMemory(PTAddr + offsetY);
				let upper = this.readMemory(PTAddr + offsetY + 8);
				
				// if (this.secOAM[i + 1] === 0xFF && this.secOAM[i + 2] === 0xFF && this.secOAM[i + 3] === 0xFF) {
				// 	lower = upper = 0;
				// }

				//空のスプライトデータ(0～3バイトが0xFF)か判定
				let empty = 1;
				if (this.secOAM[i + 1] !== 0xFF) empty = 0;
				if (this.secOAM[i + 2] !== 0xFF) empty = 0;
				if (this.secOAM[i + 3] !== 0xFF) empty = 0;
				if (empty) {
					lower = 0;
					upper = 0;
				}
				
				for (let j = 0; j < 8; j++) {
					const l = (lower >> j) & 1;
					const u = (upper >> j) & 1;
					const val = l + u * 2;
					const x = this.secOAM[i + 3] + (flipX ? j : 7 - j);
					// let x = this.secOAM[i + 3];
					// if (flipX) x += j;
					// else x += 7 - j;

					
					if ((this.OAMBuffer[x] & 3) === 0) {
						this.OAMBuffer[x] = (priority << 4) + (palette << 2) + val;
						this.OAMBuffer[x] |= this.secOAM[i + 1] << 5;
					}

					//これが重い。。。
					//this.isExistOAM[x] = 1;
				}
			}
		}
	}

	this.updateScroll = function() {
		if (!this.enableBG && !this.enableSprite) return;

		if (0 <= this.scanline && this.scanline <= 239) {
			if (1 <= this.cycle && this.cycle <= 256) {
				//vの水平位置を増分
				if ((this.cycle & 7) === 0) this.updateXScroll();

				if (this.cycle === 256) {
					//vの垂直位置を増分
					this.updateYScroll();
				}
			}
			else if (this.cycle === 257) {
				//vの水平位置をtからコピー
				const v = this.internalRegisters.v & 0x7BE0;
				this.internalRegisters.v = v | (this.internalRegisters.t & 0x041F);
			}
			else if (321 <= this.cycle && this.cycle <= 340) {
				//vの水平位置を増分
				if ((this.cycle & 7) === 0) this.updateXScroll();
			}
		}
		else if (this.scanline === 261) {
			if (1 <= this.cycle && this.cycle <= 256) {
				//vの水平位置を増分
				if ((this.cycle & 7) === 0) this.updateXScroll();

				if (this.cycle === 256) {
					//vの垂直位置を増分
					this.updateYScroll();
				}
			}
			else if (this.cycle === 257) {
				//vの水平位置をtからコピー
				const v = this.internalRegisters.v & 0x7BE0;
				this.internalRegisters.v = v | (this.internalRegisters.t & 0x041F);
			}
			else if (280 <= this.cycle && this.cycle <= 304) {
				//v垂直位置をtからコピー
				const v = this.internalRegisters.v & 0x041f;
				this.internalRegisters.v = v | (this.internalRegisters.t & 0x7BE0);

			}
			else if (321 <= this.cycle && this.cycle <= 340) {
				//vの水平位置を増分
				if ((this.cycle & 7) === 0) this.updateXScroll();
			}
		}
	}

	this.updateXScroll = function() {
		if ((this.internalRegisters.v & 0x001F) === 31) {
			this.internalRegisters.v &= ~0x001F;
			this.internalRegisters.v ^= 0x0400;
		}
		else {
			this.internalRegisters.v++;
		}

		//console.log(`[updateXScroll]v:$${this.internalRegisters.v.toString(16).padStart(4, 0)}`);
	};

	this.updateYScroll = function() {
		if ((this.internalRegisters.v & 0x7000) != 0x7000) {
			this.internalRegisters.v += 0x1000;
		}
		else {
			this.internalRegisters.v &= ~0x7000;
			let coarseY = (this.internalRegisters.v & 0x03E0) >> 5;
			if (coarseY === 29) {
				coarseY = 0;
				this.internalRegisters.v ^= 0x0800;
			}
			else if (coarseY === 31) {
				coarseY = 0;
			}
			else {
				coarseY++;
			}
			const temp = this.internalRegisters.v & ~0x03E0;
			this.internalRegisters.v = temp | (coarseY << 5);
		}

		//console.log(`[updateYScroll]v:$${this.internalRegisters.v.toString(16).padStart(4, 0)}`);
	};

	this.generatePixel = function() {
		const status = this.registers.ppustatus;
		const mask = this.registers.ppumask;
		const cycle = this.cycle - 1;
		
		const shift = 7 - ((cycle + this.internalRegisters.x + 8) & 7);
		const lower = ((this.BGTileLower & 0xFF) >> shift) & 1;
		const upper = ((this.BGTileUpper & 0xFF) >> shift) & 1;
		const attribute = this.BGTileAttribute & 3;
		const BGPixel = ((attribute << 2) | (upper << 1) | lower) + 0x3F00;
		
		const spritePixel = (this.OAMBuffer[cycle] & 0x0F) + 0x3F10;
		const spritePriority = (this.OAMBuffer[cycle] >> 4) & 1;
		const spriteIndex = (this.OAMBuffer[cycle] >> 5) & 0xFF;
		
		//背景ピクセルで初期化
		let resPixel = BGPixel;
		
		//スプライト
		if (this.scanline > 0 && this.enableSprite && (spritePixel & 3)) {
			if (spritePriority || ((BGPixel & 3) === 0)) {
				resPixel = spritePixel;
			}
			
			//スプライト0ヒット
			if (spriteIndex === this.OAM[1]) {
				let hit = 1;
				
				if (!this.enableBG) {
					//背景のレンダリング無効
					hit = 0;
				}
				//else if (!this.enableSprite) {
				//	//スプライトのレンダリング無効
				//	hit = 0;
				//}
				else if ((status >> 6) & 1) {
					//スプライト0ヒット発生済み
					hit = 0;
				}
				else if ((BGPixel & 3) === 0) {
					//背景ピクセルが透明
					hit = 0;
				}
				//else if ((spirtePixel & 3) === 0) {
				//	//スプライトピクセルが透明
				//	hit = 0;
				//}
				else if (cycle === 255) {
					//画面端(x=255)
					hit = 0;
				}
				else if (((~mask >> 1) & 3) && 0 <= cycle && cycle <= 7) {
					//クリッピングウィンドウ有効 &  x=0-7
					hit = 0;
				}
				
				if (hit) {
					this.registers.ppustatus |= (1 << 6);
				}
			}
		}
		
		if (shift === 0) {
			this.BGTileShift = 1;
			this.BGTileLower >>= 8;
			this.BGTileUpper >>= 8;
			this.BGTileAttribute >>= 2;
		}
		
		//強調
		const index = this.readMemory(resPixel);
		let [r, g, b] = this.palette[index];
		
		const emphasis = (mask >> 5) & 7;
		if (emphasis) {
			if (emphasis & 1) {
				//赤を強調
				r *= 1.1;
				g *= 0.9;
				b *= 0.9;
			}
			if ((emphasis >> 1) & 1) {
				//緑を強調
				r *= 0.9
				g *= 1.1;
				b *= 0.9;
			}
			if ((emphasis >> 2) & 1) {
				//青を強調
				r *= 0.9;
				g *= 0.9;
				b *= 1.1;
			}

			r &= 0xFF;
			g &= 0xFF;
			b &= 0xFF;
		}
		
		// const res = (r << 16) | (g << 8) | b;
		// return res;
		return [r, g, b];
	}

	this.BGTileShift = 0;
	this.BGTileLower = 0;
	this.BGTileUpper = 0;
	this.BGTileAttribute = 0;

	this.loadPatternData = function() {
		const v = this.internalRegisters.v;
		const ppuctrl = this.registers.ppuctrl;

		const nametableAddress = 0x2000 | (v & 0x0fff);
		const attributetableAddress = 0x23c0 | (v & 0x0c00) | ((v >> 4) & 0x38) | ((v >> 2) & 0x07);

		const patterntableIndex = this.readMemory(nametableAddress);
		const fineY = v >> 12;
		const BackgroundPatterntableAddress = ((ppuctrl >> 4) & 1 ? 0x1000 : 0x0000);
		const patterntableAddress =  patterntableIndex * 16 + fineY + BackgroundPatterntableAddress;

		const tileLow = this.readMemory(patterntableAddress);
		const tileHigh = this.readMemory(patterntableAddress + 8);
		const attribute = this.readMemory(attributetableAddress);

		const coarseXBit1 = (v >> 1) & 1;
		const coarseYBit1 = (v >> 6) & 1;
		const quadrant = ((coarseYBit1 << 2) | (coarseXBit1 << 1));
		
		if (!this.BGTileShift) {
			this.BGTileLower >>= 8;
			this.BGTileUpper >>= 8;
			this.BGTileAttribute >>= 2;
		}
		else {
			this.BGTileShift = 0;
		}

		this.BGTileLower |= (tileLow << 8);
		this.BGTileUpper |= (tileHigh << 8);
		this.BGTileAttribute |= (((attribute >> quadrant) & 3) << 2);

		return;

		// this.shiftRegisters.lowerBitPlane.push(tileLow);
		// this.shiftRegisters.upperBitPlane.push(tileHigh);
		// this.shiftRegisters.attribute.push((attribute >> quadrant) & 0x03);
		// this.shiftRegisters.nametableAddress.push(nametableAddress);

		// if (this.shiftRegisters.lowerBitPlane.length > 2) {
		// 	this.shiftPatternData();
		// }
	}

	this.width;
	this.height;
	this.imageData;

	this.drawPixel = function(x, y, r, g, b, a = 255) {
		if (y < 0 || 240 < y || x < 0 || 256 < x) return;
		const p = (y * this.width + x) * 4;
		this.imageData.data[p + 0] = r;
		this.imageData.data[p + 1] = g;
		this.imageData.data[p + 2] = b;
		this.imageData.data[p + 3] = a;
	}

	this.render = function() {
		//ctx.fillStyle = "black";
		//ctx.fillRect(0, 0, this.width, this.height);
		ctx.putImageData(this.imageData, 0, 0);
	}

	this.imageDataPatterntable;
	this.imageDataPaletteRAM;
	this.imageDataNametable;
	this.imageDataSpritelist;

	this.debugRender = function() {
		const showPatterntable = 1;
		const showSpritelist = 1;
		const showPaletteRAM = 1;
		const showNametable = 1;

		//パターンテーブル
		if (showPatterntable) {
			for (let table = 0; table < 2; table++) {
				for (let coarseY = 0; coarseY < 16; coarseY++) {
					for (let coarseX = 0; coarseX < 16; coarseX++) {
						const tileIndex = coarseY * 16 + coarseX;

						for (let fineY = 0; fineY < 8; fineY++) {
							let patterntableAddress = (tileIndex * 16) + fineY + table * 0x1000;
							const lower = this.readMemory(patterntableAddress);
							const upper = this.readMemory(patterntableAddress + 8);

							for (let fineX = 0; fineX < 8; fineX++) {
								const pixelPattern = ((lower >> fineX) & 1) + ((upper >> fineX) & 1) * 2;
								const paletteRAMIndex = pixelPattern + 0x3F00;
								//const paletteIndex = this.paletteRAM[paletteRAMIndex];
								const paletteIndex = this.readMemory(paletteRAMIndex);
								const [r, g, b] = this.palette[paletteIndex];
								const imageDataIndex = (fineY * 8 + (7 - fineX)) * 4;

								this.imageDataPatterntable.data[imageDataIndex + 0] = r;
								this.imageDataPatterntable.data[imageDataIndex + 1] = g;
								this.imageDataPatterntable.data[imageDataIndex + 2] = b;
								this.imageDataPatterntable.data[imageDataIndex + 3] = 255;
							}
						}
						contextPatterntable.putImageData(this.imageDataPatterntable, coarseX * 8 + table * 128, coarseY * 8);
					}
				}
			}
		}

		//スプライト
		if (showSpritelist) {
			const spritePatterntableAddress = (this.registers.ppuctrl >> 3) & 1;
			const spriteSize = (this.registers.ppuctrl >> 5) & 1;
			for (let coarseY = 0; coarseY < 4; coarseY++) {
				for (let coarseX = 0; coarseX < 16; coarseX++) {
					const spritelistIndex = coarseY * 16 + coarseX;
					const tileIndex = this.OAM[(spritelistIndex * 4) + 1];
					const attributes = this.OAM[(spritelistIndex * 4) + 2];
					const palette = attributes & 3;
					const priority = (~attributes >> 5) & 1;

					if (spriteSize === 0) {
						//8x8
						for (let fineY = 0; fineY < 8; fineY++) {
							const patterntableAddress = (tileIndex * 16) + fineY + (spritePatterntableAddress * 0x1000);
							const lower = this.readMemory(patterntableAddress);
							const upper = this.readMemory(patterntableAddress + 8);
		
							for (let fineX = 0; fineX < 8; fineX++) {
								const pixelPattern = ((lower >> fineX) & 1) + ((upper >> fineX) & 1) * 2;
								const paletteRAMIndex = pixelPattern + 0x3F10 + (palette * 4);
								const paletteIndex = this.readMemory(paletteRAMIndex);
								const [r, g, b] = this.palette[paletteIndex];
								const imageDataIndex = (fineY * 8 + (7 - fineX)) * 4;
		
								this.imageDataSpritelist.data[imageDataIndex + 0] = r;
								this.imageDataSpritelist.data[imageDataIndex + 1] = g;
								this.imageDataSpritelist.data[imageDataIndex + 2] = b;
								this.imageDataSpritelist.data[imageDataIndex + 3] = (pixelPattern ? 255 : 128);
							}
						}
						contextSpritelist.putImageData(this.imageDataSpritelist, coarseX * 8, coarseY * 16);
		
						for (let fineY = 0; fineY < 8; fineY++) {
							for (let fineX = 0; fineX < 8; fineX++) {
								const imageDataIndex = (fineY * 8 + (7 - fineX)) * 4;
		
								this.imageDataSpritelist.data[imageDataIndex + 0] = 0;
								this.imageDataSpritelist.data[imageDataIndex + 1] = 0;
								this.imageDataSpritelist.data[imageDataIndex + 2] = 0;
								this.imageDataSpritelist.data[imageDataIndex + 3] = (priority ? 255 : 128);
							}
						}
						contextSpritelist.putImageData(this.imageDataSpritelist, coarseX * 8, coarseY * 16 + 8);
					}
					else {
						//8x16
						for (let fineY = 0; fineY < 8; fineY++) {
							const bank = tileIndex & 1;
							const patterntableAddress = (tileIndex >> 1) * 32 + fineY + (bank * 0x1000);
							const lower = this.readMemory(patterntableAddress);
							const upper = this.readMemory(patterntableAddress + 8);
		
							for (let fineX = 0; fineX < 8; fineX++) {
								const pixelPattern = ((lower >> fineX) & 1) + ((upper >> fineX) & 1) * 2;
								const paletteRAMIndex = pixelPattern + 0x3F10 + (palette * 4);
								const paletteIndex = this.readMemory(paletteRAMIndex);
								const [r, g, b] = this.palette[paletteIndex];
								const imageDataIndex = (fineY * 8 + (7 - fineX)) * 4;
		
								this.imageDataSpritelist.data[imageDataIndex + 0] = r;
								this.imageDataSpritelist.data[imageDataIndex + 1] = g;
								this.imageDataSpritelist.data[imageDataIndex + 2] = b;
								this.imageDataSpritelist.data[imageDataIndex + 3] = 255;
							}
						}
						contextSpritelist.putImageData(this.imageDataSpritelist, coarseX * 8, coarseY * 16);
		
						for (let fineY = 0; fineY < 8; fineY++) {
							const bank = tileIndex & 1;
							const patterntableAddress = (tileIndex >> 1) * 32 + fineY + (bank * 0x1000);
							const lower = this.readMemory(patterntableAddress + 16);
							const upper = this.readMemory(patterntableAddress + 24);
		
							for (let fineX = 0; fineX < 8; fineX++) {
								const pixelPattern = ((lower >> fineX) & 1) + ((upper >> fineX) & 1) * 2;
								const paletteRAMIndex = pixelPattern + 0x3F10 + (palette * 4);
								const paletteIndex = this.readMemory(paletteRAMIndex);
								const [r, g, b] = this.palette[paletteIndex];
								const imageDataIndex = (fineY * 8 + (7 - fineX)) * 4;
		
								this.imageDataSpritelist.data[imageDataIndex + 0] = r;
								this.imageDataSpritelist.data[imageDataIndex + 1] = g;
								this.imageDataSpritelist.data[imageDataIndex + 2] = b;
								this.imageDataSpritelist.data[imageDataIndex + 3] = 255;
							}
						}
						contextSpritelist.putImageData(this.imageDataSpritelist, coarseX * 8, coarseY * 16 + 8);
					}
					
				}
			}
		}
		

		//パレットRAM
		if (showPaletteRAM) {
			for (let coarseY = 0; coarseY < 2; coarseY++) {
				for (let coarseX = 0; coarseX < 16; coarseX++) {
					const paletteRAMIndex = coarseY * 16 + coarseX;
					const paletteIndex = this.paletteRAM[paletteRAMIndex];
					const [r, g, b] = this.palette[paletteIndex];
					
					for (let fineY = 0; fineY < 8; fineY++) {
						for (let fineX = 0; fineX < 8; fineX++) {
							let imageDataIndex = (fineY * 8 + fineX) * 4;
							this.imageDataPaletteRAM.data[imageDataIndex + 0] = r;
							this.imageDataPaletteRAM.data[imageDataIndex + 1] = g;
							this.imageDataPaletteRAM.data[imageDataIndex + 2] = b;
							this.imageDataPaletteRAM.data[imageDataIndex + 3] = 255;
						}
					}
					contextPaletteRAM.putImageData(this.imageDataPaletteRAM, coarseX * 8, coarseY * 8);
				}
			}
		}

		//ネームテーブル
		if (showNametable) {
			for (let bank = 0; bank < 4; bank++) {
				for (let coarseY = 0; coarseY < 30; coarseY++) {
					for (let coarseX = 0; coarseX < 32; coarseX++) {
						const nametableAddress = coarseY * 32 + coarseX + (bank * 0x400 + 0x2000);
						const patterntableIndex = this.readMemory(nametableAddress);
						
						const attributetableY = coarseY >> 2;
						const attributetableX = coarseX >> 2;
						const attributetableAddress = attributetableY * 8 + attributetableX + (bank * 0x400 + 0x23C0);
						const attributeValue = this.readMemory(attributetableAddress);

						const quadrant = ((coarseX >> 1) & 1) * 2 + ((coarseY >> 1) & 1) * 4;
						const paletteNumber = (attributeValue >> quadrant) & 3;

						for (let fineY = 0; fineY < 8; fineY++) {
							let patterntableAddress = patterntableIndex * 16 + fineY;
							if ((this.registers.ppuctrl >> 4) & 1) {
								patterntableAddress += 0x1000;
							}
							const bitPalne0 = this.readMemory(patterntableAddress);
							const bitPalne1 = this.readMemory(patterntableAddress + 8);

							for (let fineX = 0; fineX < 8; fineX++) {
								const pixelValue = ((bitPalne0 >> fineX) & 1) + ((bitPalne1 >> fineX) & 1) * 2;
								const paletteRAMIndex = (pixelValue + paletteNumber * 4) + 0x3F00;
								//const paletteIndex = this.paletteRAM[pixelValue];
								const paletteIndex = this.readMemory(paletteRAMIndex);
								const [r, g, b] = this.palette[paletteIndex];
								const imageDataIndex = (fineY * 8 + (7 - fineX)) * 4;

								this.imageDataNametable.data[imageDataIndex + 0] = r;
								this.imageDataNametable.data[imageDataIndex + 1] = g;
								this.imageDataNametable.data[imageDataIndex + 2] = b;
								this.imageDataNametable.data[imageDataIndex + 3] = 255;
							}
						}
						contextNametable.putImageData(this.imageDataNametable, coarseX * 8 + bank * 256, coarseY * 8);
					}
				}
			}
		}
	}
}
