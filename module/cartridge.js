
export function Cartridge() {
	this.header;
	this.PRGROM;
	this.PRGRAM;
	this.CHRROM;

	this.mapper;
	this.mapperNumber;

	this.PRGROMSize;
	this.CHRROMSize;

	//オープンバス
	this.prevReadAddress = 0;

	this.init = function(result) {
		const buf = new Uint8Array(result);

		//ヘッダー読み込み
		this.header = new Array(16).fill(0);
		for (let i = 0; i < 16; i++) {
			this.header[i] = buf[i];
		}

		//ヘッダー確認
		{
			let iNESFormat = 0;
			if (this.header[0] === 0x4E &&
				this.header[1] === 0x45 &&
				this.header[2] === 0x53 &&
				this.header[3] === 0x1A)
			{
				iNESFormat = 1;
			}
			else {
				console.log(this.header);
				console.error(".nesファイルフォーマットに準拠してません。。。");
			}

			let iNES2Format = 0;
			if (iNESFormat && (this.header[7] & 0x0C) === 0x08) {
				iNES2Format = 1;
				console.log("NES 2.0対応");
			}
		}
		
		//PRG ROMサイズ(16KB単位)
		this.PRGROMSize = this.header[4] * 0x4000;
		this.PRGROM = new Array(this.PRGROMSize).fill(0);

		//CHH ROMサイズ(8KB単位)
		this.CHRROMSize = this.header[5] * 0x2000;
		this.CHRROM = new Array(Math.max(this.CHRROMSize, 0x2000)).fill(0);
		
		//マッパー番号
		const mapperNumberLower = this.header[6] >> 4;
		const mapperNumberUpper = this.header[7] >> 4;
		this.mapperNumber = (mapperNumberUpper << 4) | mapperNumberLower;
		
		switch (this.mapperNumber) {
			case 0: {
				this.mapper = new Mapper0();
				break;
			}

			case 1: {
				this.mapper = new Mapper1(this.PRGROMSize, this.CHRROMSize);
				break;
			}

			case 2: {
				this.mapper = new Mapper2(this.PRGROMSize, this.CHRROMSize);
				break;
			}

			case 3: {
				this.mapper = new Mapper3(this.PRGROMSize, this.CHRROMSize);
				break;
			}

			case 4: {
				this.mapper = new Mapper4(this.PRGROMSize, this.CHRROMSize);
				break;
			}

			default: {
				this.mapper = new Mapper0();
				console.error(`マッパー#${this.mapperNumber}はサポートされてません`);
				break;
			}
		}

		//RPG ROM読み込み
		let offset = 16;
		for (let i = 0; i < this.PRGROMSize; i++) {
			this.PRGROM[i] = buf[i + offset];
		}
	
		{
			if (this.PRGROMSize === 0x4000) {
				//NROM-256(PRGROMが16KB)の場合、
				//0xC000-0XFFFFは0x8000-0xBFFFのミラー
				for (let i = 0; i < this.PRGROMSize; i++) {
					this.PRGROM[i + this.PRGROMSize] = buf[i + offset];
				}
			}
		}
		offset += this.PRGROMSize;

		//CHR ROM読み込み
		for (let i = 0; i < this.CHRROMSize; i++) {
			this.CHRROM[i] = buf[i + offset];
		}
		offset += this.CHRROMSize;

		//PRG-RAM(オプション)
		const prgramSize = Math.max(1, this.header[8]) * 0x2000;
		this.PRGRAM = new Array(prgramSize).fill(0);

		// console.log(this.header);
		// console.log(offset);
		console.log(`PRGROM:${this.PRGROMSize.toString(16)}`);
		console.log(`PRGRAM:${this.PRGRAM.length.toString(16)}`);
		//console.log(this.PRGROM);
		console.log(`CHRROM:${this.CHRROMSize.toString(16)}`);
		// console.log(this.CHRROM);
		console.log(`Mapper:${this.mapperNumber}`);
	}

	this.readHeader = function(address) {
		return this.header[address];
	}

	this.readPRGROM = function(address) {
		const a = this.mapper.readPRGROM(address);
		//console.log(`cartrideg readPRGROM():${address} ${a.toString(16).padStart(4, 0)} = ${this.PRGROM[a].toString(16)}`);
		return this.PRGROM[a];
	}

	this.writePRGROM = function(address, data) {
		this.mapper.writePRGROM(address, data);
		return;
	}

	this.readPRGRAM = function(address) {
		//0x6000-0x7FFF(8KB)
		const a = this.mapper.readPRGRAM(address);
		if (a >= 0 && a < this.PRGRAM.length) {
			//console.log(`readPRGRAM():$${address.toString(16).padStart(4, 0)}=$${this.PRGRAM[a]}`);
			return this.PRGRAM[a];
		}
		else {
			console.error(`readPRGRAM() 無効なアドレス$${address.toString(16)}にアクセスがありました`);
			return 0;
		}
	}

	this.writePRGRAM = function(address, data) {
		const a = this.mapper.writePRGRAM(address);
		if (a >= 0 && a < this.PRGRAM.length) {
			this.PRGRAM[a] = data;
			//console.log(`writePRGRAM():$${address.toString(16).padStart(4, 0)}=$${data}`);
		}
		else {
			console.error(`writePRGRAM() 無効なアドレス$${address.toString(16)}にアクセスがありました`);
		}
	}
	
	this.readCHRROM = function(address) {
		const a = this.mapper.readCHRROM(address);
		return this.CHRROM[a];
	}

	this.writeCHRROM = function(address, data) {
		const a = this.mapper.writeCHRROM(address, data);
		//this.CHRROM[a] = data;
		if (this.CHRROMSize === 0) {
			//CHR-RAM
			this.CHRROM[a] = data;
		}
		else {
			//CHR-ROM
			;
		}
		return;
	}

	this.debug = function() {
		if (this.mapper.PRGBank === 0x0A) {
			return 1;
		}
		return 0;
	}

	this.getMirroringMode = function() {
		let mode = this.mapper.getMirroringMode();
		if (mode === "") {
			if (this.header[6] & 1) {
				mode = "vertical";
			}
			else {
				mode = "horizontal";
			}
		}
		return mode;
	}

	this.assertIRQ = function() {
		return this.mapper.assertIRQ();
	}

	this.update = function() {
		this.mapper.update();
	}
};

function Mapper0() {
	this.readPRGROM = function(address) {
		return address;
	}

	this.writePRGROM = function(address, data) {
		return address;
	}

	this.readPRGRAM = function(address) {
		return address;
	}

	this.writePRGRAM = function(address, data) {
		return address;
	}

	this.readCHRROM = function(address) {
		return address;
	}

	this.writeCHRROM = function(address, data) {
		return address;
	}

	this.getMirroringMode = function() {
		return "";
	}

	this.assertIRQ = function() {
		return 0;
	}

	this.update = function() {
		return;
	}
}

function Mapper1(PRGROMSize, CHRROMSize) {
	//レジスタ
	this.shiftRegister = 0;
	this.control = 0;
	this.CHRBank0 = 0;
	this.CHRBank1 = 0;
	this.PRGBank = (PRGROMSize >> 14) - 1;
	
	this.PRGROMSize = PRGROMSize;
	this.CHRROMSize = CHRROMSize;

	this.writePRGROM = function(address, data) {
		if ((data >> 7) & 1) {
			//シフトレジスタをリセット
			this.shiftRegister = 0x10;

			//D3、D2に1をセット
			this.control |= 0x0C;
		}
		else {
			if (this.shiftRegister & 1) {
				//5回目書き込み
				const val = (((data & 1) << 4) | (this.shiftRegister >> 1)) & 0x1F;
				const bank = (address >> 13) & 3;
				if (bank === 0) {
					//コントロール
					this.control = val;
				}
				else if (bank === 1) {
					//CHRバンク0
					this.CHRBank0 = val;
				}
				else if (bank === 2) {
					//CHRバンク1
					this.CHRBank1 = val;
				}
				else if (bank === 3) {
					//PRGバンク
					this.PRGBank = val;
				}
				
				//シフトレジスタをリセット
				this.shiftRegister = 0x10;
			}
			else {
				//1-4回目書き込み
				this.shiftRegister >>= 1;
				this.shiftRegister |= ((data & 1) << 4);
			}
		}
	}

	this.readPRGROM = function(address) {
		const home = (this.control >> 2) & 1;
		const mode = (this.control >> 3) & 1;
		let bank = this.PRGBank & 15;
		let res = address & 0x3FFF;

		if (mode === 0) {
			//32KB
			//ビット0は無視する
			bank >>= 1;
			//res += 0x8000 * bank;
			res = address + 0x8000 * bank;
		}
		else {
			if (home === 0) {
				//$8000を最初のバンク固定
				if (address <= 0x3FFF) {
					//res += this.PRGROMSize - 0x4000;
				}
				else {
					res += 0x4000 * bank;
				}
				//console.log(this.control.toString(2), res.toString(16));
			}
			else {
				//$C000は最後のバンク固定
				if (address <= 0x3FFF) {
					res += 0x4000 * bank;
				}
				else {
					res += this.PRGROMSize - 0x4000;
				}
			}
		}
		return res;
	}

	///// PRG-RAMバンク(オプション) 8KB /////
	this.readPRGRAM = function(address) {
		return address;
	}

	this.writePRGRAM = function(address, data) {
		return address;
	}

	this.writeCHRROM = function(address, data) {
		const mode = (this.control >> 4) & 1;

		if (mode === 0) {
			//8KB
			return address + this.CHRBank0 * 0x2000;
		}
		else if (mode === 1) {
			//4KB
			let res = address & 0x0FFF;
			if (0x1000 <= address && address < 0x1000) {
				res += this.CHRBank0 * 0x1000;
			}
			else if (0x1000 <= address && address < 0x2000) {
				res += this.CHRBank1 * 0x1000;
			}
			return res;
		}
		else {
			console.log("mapper#1 errorrrr!!!");
			return -1;
		}
	}

	this.readCHRROM = function(address) {
		const mode = (this.control >> 4) & 1;

		if (mode === 0) {
			//8KB
			return address + this.CHRBank0 * 0x2000;
		}
		else if (mode === 1) {
			//4KB
			let res = address & 0x0FFF;
			if (0x1000 <= address && address < 0x1000) {
				res += this.CHRBank0 * 0x1000;
			}
			else if (0x1000 <= address && address < 0x2000) {
				res += this.CHRBank1 * 0x1000;
			}
			return res;
		}
		else {
			console.log("mapper#1 errorrrr!!!");
			return -1;
		}
	}

	this.getMirroringMode = function() {
		const arrangement = (this.control & 3);
		if (arrangement === 0 || arrangement === 1) {
			return "single";
		}
		else if (arrangement === 2) {
			return "vertical";
		}
		else if (arrangement === 3) {
			return "horizontal";
		}
	}

	this.assertIRQ = function() {
		return 0;
	}

	this.update = function() {
		return;
	}
}

function Mapper2(PRGROMSize, CHRROMSize) {
	//$8000-$BFFF PRG ROM(16KB) 切り替え可
	//$C000-$FFFF PRG ROM(16KB) 固定

	this.PRGROMSize = PRGROMSize;
	this.CHRROMSize = CHRROMSize;

	this.bankSelect = 0;

	this.writePRGROM = function(address, data) {
		if (0x0000 <= address && address <= 0x7FFF) {
			this.bankSelect = data & 0x07;
		}
	}

	this.readPRGROM = function(address) {
		let res = address & 0x3FFF;
		if (0x0000 <= address && address <= 0x3FFF) {
			res += 0x4000 * this.bankSelect;
		}
		else {
			res += this.PRGROMSize - 0x4000;
			//res += 0x4000 * 7;
		}
		return res;
	}

	///// PRG RAM なし //////
	this.readPRGRAM = function(address) {
		return -1;
	}

	this.writePRGRAM = function(address, data) {
		return -1;
	}

	this.writeCHRROM = function(address, data) {
		return address;
	}

	this.readCHRROM = function(address) {
		return address;
	}

	this.getMirroringMode = function() {
		return "";
	}

	this.assertIRQ = function() {
		return 0;
	}

	this.update = function() {
		return;
	}
}

function Mapper3(PRGROMSize, CHRROMSize) {
	//PRG ROM:32KB(32KB * 1)
	//PRG RAM:なし
	//CHR ROM:32KB(8KB * 4)
	this.register = 0;
	this.CHRROMSize = CHRROMSize;

	this.readPRGROM = function(address) {
		return address;
	}

	this.writePRGROM = function(address, data) {
		this.register = data;
		if (this.CHRROMSize <= (1 << 14)) this.register &= ~(1 << 1);
		return -1;
	}

	this.readPRGRAM = function(address) {
		return address;
	}

	this.writePRGRAM = function(address, data) {
		return address;
	}

	this.readCHRROM = function(address) {
		const res = (this.register & 3) * 0x2000 + address;
		return res;
	}

	this.writeCHRROM = function(address, data) {
		const res = (this.register & 3) * 0x2000 + address;
		return res;
	}

	this.getMirroringMode = function() {
		return "";
	}

	this.assertIRQ = function() {
		return 0;
	}

	this.update = function() {
		return;
	}
}

function Mapper4(PRGROMSize, CHRROMSize) {
	//CPU
	//$6000-$7FFF PRG RAM(8KB) オプション
	//$8000-$9FFF RPG ROM(8KB) 切り替え可($C000-$DFFF)
	//$A000-$BFFF PRG ROM(8KB) 切り替え可
	//$C000-$DFFF PRG ROM(8KB) 最後から2番目のバンク固定($8000-$9FFF)
	//$E000-$FFFF RPG ROM(8KB) 最後のバンク固定

	//PPU
	//$0000-$07FF CHR ROM(2KB) 切り替え可
	//$0800-$0FFF CHR ROM(2KB) 切り替え可
	//$1000-$13FF CHR ROM(1KB) 切り替え可
	//$1400-$17FF CHR ROM(1KB) 切り替え可
	//$1800-$1BFF CHR ROM(1KB) 切り替え可
	//$1C00-$1FFF CHR ROM(1KB) 切り替え可

	//$8000-$9FFE(偶数アドレス)
	this.bankSelect = 0;

	//$8001-$9FFF(奇数アドレス)
	this.bankData = 0;

	//$A000-$BFFE(偶数アドレス)
	this.mirroring = 0;

	//$A001-$BFFF(奇数アドレス)
	this.PRGRAMProtect = 0;

	//$C000-$DFFE(偶数アドレス)
	this.IRQLatch = 0;

	//$C001-$DFFF(奇数アドレス)
	this.IRQReload = 0;

	//$E000-$FFFE(偶数アドレス)
	//this.IRQDisable = 0;

	//$E001-$FFFF(奇数アドレス)
	this.IRQEnable = 0;

	this.IRQCounter = 0;
	this.IRQFlag = 0;

	//this.bankRegister = new Array(8);
	this.bankRegister = [
		0x0000, 0x0400, 0x0800, 0x0C00, 0x1000, 0x1400, 0x1800, 0x1C00
	];
	this.PRGROMSize = PRGROMSize;
	this.CHRROMSize = CHRROMSize;

	this.writePRGROM = function(address, data) {
		const a13_14 = (address >> 13) & 3;

		//console.log("cartridge writeRPGROM()", a13_14, (address + 0x8000).toString(16), data.toString(2).padStart(8, 0));

		switch (a13_14) {
			case 0: {
				//$8000-$9FFF
				//console.log(address.toString(16).padStart(4, 0), data.toString(2).padStart(8, 0));

				if (address & 1) {
					//バンクデータ
					//this.bankData = data;
					
					const bank = this.bankSelect & 7;
					//const A12Inversion = (data >> 7) & 1;
					if (bank <= 1) {
						//CHR Banks(2KB)
						//R0,R1は下位1ビット無視
						this.bankRegister[bank] = (data & 0xFE) * 0x0400;// + A12Inversion * 0x1000;

						//const addr = (data & 0xFE) * 0x0400;// + A12Inversion * 0x1000;
						//console.log(`CHR Bank R${bank}を${addr.toString(16)}～${(addr + 0x7FF).toString(16)}に切り替えました`);
					}
					else if (bank <= 5) {
						//CHR Banks(1KB)
						this.bankRegister[bank] = data * 0x0400;// + !A12Inversion * 0x1000;

						//const addr = data * 0x0400;// + !A12Inversion * 0x1000;
						//console.log(`CHR Bank R${bank}を${addr.toString(16)}～${(addr + 0x3FF).toString(16)}に切り替えました`);
					}
					else {
						//PRG Banks
						//R6,R7は上位2ビット無視
						const a6 = (this.bankSelect >> 6) & 1;
						this.bankRegister[bank] = (data & 0x3F) * 0x2000;

						const addr = (data & 0x3F) * 0x2000;
						//console.log(`PRG Bank R${bank}を${addr.toString(16)}～${(addr + 0x1FFF).toString(16)}に切り替えました`);
					}
				}
				else {
					//バンク選択
					this.bankSelect = data;
				}
				break;
			}

			case 1: {
				if (address & 1) {
					//PRG RAMプロテクト
					this.PRGRAMProtect = data;
				}
				else {
					//ミラーリング
					this.mirroring = data;
				}
				break;
			}

			case 2: {
				if (address & 1) {
					//IRQリロード
					this.IRQReload = 1;
					this.IRQCounter = 0;//this.IRQLatch;
					//console.log("IRQリロード");
				}
				else {
					//IRQラッチ
					this.IRQLatch = data;
					//console.log("IRQラッチ", data.toString(16));
				}
				break;
			}

			case 3: {
				if (address & 1) {
					//IRQ有効
					this.IRQEnable = 1;
					//console.log("IRQ有効");
				}
				else {
					//IRQ無効
					this.IRQEnable = 0;
					this.IRQFlag = 0;
					//console.log("IRQ無効");
				}
				break;
			}

			default: {
				console.error("Mapper#4 writePRGROM error!!!!!");
				break;
			}
		}
	}

	this.readPRGROM = function(address) {
		let res = address & 0x1FFF;
		const mode = (this.bankSelect >> 6) & 1;

		if (address < 0x2000) {
			//$8000-$9FFF
			if (mode === 0) {
				//R6
				res += this.bankRegister[6];
				//console.log(`readPRGROM() R6 ${address.toString(16)} → ${res.toString(16)}`);
			}
			else {
				//最後から2番目のバンク
				res += this.PRGROMSize - 0x4000;
				//console.log(`readPRGROM() -2 ${address.toString(16)} → ${res.toString(16)}`);
			}
		}
		else if (address < 0x4000) {
			//$A000-$BFFF
			//R7
			res += this.bankRegister[7];
			//console.log(`readPRGROM() R7 ${address.toString(16)} → ${res.toString(16)}`);
		}
		else if (address < 0x6000) {
			//$C000-$DFFF
			if (mode === 0) {
				//最後から2番目のバンク
				res += this.PRGROMSize - 0x4000;
				//console.log(`readPRGROM() -2 ${address.toString(16)} → ${res.toString(16)}`);
			}
			else {
				//R6
				res += this.bankRegister[6];
				//console.log(`readPRGROM() R6 ${address.toString(16)} → ${res.toString(16)}`);
			}
		}
		else if (address < 0x8000) {
			//$E000-$FFFF
			//最後のバンク
			res += this.PRGROMSize - 0x2000;
			//console.log(`readPRGROM() -1 ${address.toString(16)} → ${res.toString(16)}`);
		}

		return res;
	}

	this.writePRGRAM = function(address) {
		const protection = (this.PRGRAMProtect >> 6) & 1;
		const enable = (this.PRGRAMProtect >> 7) & 1;

		if (protection || !enable) {
			//書き込み不可
			//console.log("[cartridge.writePRGRAM()]書き込み不可", protection, enable);
			return -1;
		}
		
		return address;
	}

	this.readPRGRAM = function(address) {
		const enable = (this.PRGRAMProtect >> 7) & 1;

		if (!enable) {
			//オープンバス動作
			console.log("[cartridge.readPRGRAM()]オープンバス動作(未定義)", enable);
			return -1;
		}		
		return address;
	}

	this.writeCHRROM = function(address, data) {
		let res = address & 0x7FF;
		const mode = (this.bankSelect >> 7) & 1;

		if (mode === 0) {
			if (address <= 0x0FFF) {
				//R0-1(2KB)
				const r = (address >> 11) & 1;
				res = (address & 0x07FF) + this.bankRegister[r];

				//console.log(this.bankRegister);
			}
			else if (address <= 0x1FFF) {
				//R2-5(1KB)
				const r = ((address >> 10) & 3) + 2;
				res = (address & 0x03FF) + this.bankRegister[r];
			}
		}
		else {
			if (address <= 0x0FFF) {
				//R2-4(1KB)
				const r = ((address >> 10) & 3) + 2;
				res = (address & 0x03FF) + this.bankRegister[r];
			}
			else if (address <= 0x1FFF) {
				//R0-1(2KB)
				const r = (address >> 11) & 1;
				res = (address & 0x07FF) + this.bankRegister[r];
			}
		}

		//console.log(`writeCHRROM():$${res.toString(16)} mode:${mode} address:$${address.toString(16)}`);


		return res;
	}
	
	this.prevA12 = 0;
	this.readCHRROM = function(address) {
		let res = this.writeCHRROM(address);

		// const A12 = (address >> 12) & 1;
		// if (A12 && !this.prevA12) {
		// 	console.log("A12立上りエッジが検出")
		// }
		// this.prevA12 = A12;

		return res;
	}

	this.getMirroringMode = function() {
		if (this.mirroring === 0) {
			return "vertical";
		}
		else {
			return "horizontal";
		}
	}

	//ppu.run()で最初のスプライト更新時に呼び出す
	this.update = function() {
		//console.log("IRQCounter:", this.IRQCounter);
		
		if (this.IRQReload || this.IRQCounter === 0) {
			this.IRQCounter = this.IRQLatch;
			this.IRQReload = 0;
		}
		else {
			this.IRQCounter--;
		}

		if (this.IRQCounter === 0) {
			if (this.IRQEnable) {
				this.IRQFlag = 1;
				//console.log("IRQ Flag = 1");
			}
		}
	}

	this.assertIRQ = function() {
		return this.IRQFlag;
	}
}
