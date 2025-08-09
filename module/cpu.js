
export function CPU() {
	this.registers = {
		a:	0x00,
		x:	0x00,
		y:	0x00,
		pc:	0x00,
		s:	0xfd,
		p:	0x24
	};

	this.flags = {
		negative:	false,
		overflow:	false,
		reserved:	true,
		break:		false,
		decimal:	false,
		interrupt:	true,
		zero:		false,
		carry:		false
	};

	this.ram = new Array(0x0800);
	this.ram.fill(0);

	this.ppu;
	this.apu;
	this.cartridge;

	this.debug_nestest = 0;

	this.logs = [];
	this.nestestLog = {
		pc: 0,
		opcode: 0,
		operand: [],
		mnemonic: "",
		a: 0,
		x: 0,
		y: 0,
		p: 0,
		sp: 0,
		ppu: [0, 0],
		cyc: 7,

		cycTemp: 0,
	};

	this.hardwareReset = function() {
		this.registers.a = 0;
		this.registers.x = 0;
		this.registers.y = 0;

		//割込みベクタから飛び先をロードする
		const lower = this.read(0xfffc);
		const upper = this.read(0xfffd);
		this.registers.pc = (upper << 8) + lower;

		this.registers.s = 0xFD;

		//this.registers.p = 0x24;
		this.flags.negative = false;
		this.flags.overflow = false;
		this.flags.reserved = true;
		this.flags.break = false;
		this.flags.decimal = false;
		this.flags.interrupt = true;
		this.flags.zero = false;
		this.flags.carry = false;

		//nestest用
		if (this.debug_nestest) {
			//this.registers.pc = 0xC000;
		}

		this.waitCycle = 7;
	}
	
	this.softwareReset = function() {
		this.assertInterruptReset = 1;
	}

	this.setPPU = function(ppu) {
		this.ppu = ppu;
	}

	this.setAPU = function(apu) {
		this.apu = apu;
	}

	this.setGamepad = function(gamepad) {
		this.gamepad = gamepad;
	}

	this.setCartridge = function(cartridge) {
		this.cartridge = cartridge;
	}

	this.fetchProcessorStatus = function() {
		let p = 0;
		if (this.flags.negative) p |= (1 << 7);
		if (this.flags.overflow) p |= (1 << 6);
		if (this.flags.reserved) p |= (1 << 5);
		if (this.flags.break) p |= (1 << 4);
		if (this.flags.decimal) p |= (1 << 3);
		if (this.flags.interrupt) p |= (1 << 2);
		if (this.flags.zero) p |= (1 << 1);
		if (this.flags.carry) p |= (1 << 0);
		return p;
	}

	this.write = function(address, value) {
		if (address <= 0x1fff) {
			//WRAM
			this.ram[address & 0x07FF] = value;
		}
		else if (address <= 0x3fff) {
			//PPUレジスタのミラー
			const a = address & 0x2007;
			this.ppu.writeRegisters(address & 0x2007, value);

			//console.log(`$${a.toString(16).padStart(4,0)}=$${value.toString(2).padStart(8, 0)}`);
		}
		else if (address <= 0x4017) {
			//https://www.nesdev.org/wiki/2A03
			
			if (address <= 0x4013) {
				//apu
				this.apu.writeRegisters(address, value);
			}
			else if (address === 0x4014) {
				//OAM DMA
				this.ppu.writeRegisters(address, value);
			}
			else if (address === 0x4015) {
				//apu
				this.apu.writeRegisters(address, value);
			}
			else if (address === 0x4016) {
				//joystick
				this.gamepad.write(address, value);
			}
			else if (address === 0x4017) {
				//apu
				this.apu.writeRegisters(address, value);
			}
		}
		else if (address <= 0x401f) {
			if (address <= 0x401A) {
				//apu test(disable)
				console.log("apu test functionality");
			}
			else if (address <= 0x401F) {
				//disable
				console.log("unfinished IRQ timer functionality");
			}
		}
		else if (address <= 0x5fff) {
			//???
		}
		else if (address <= 0x7fff) {
			//ROM内のWRAM、またはPRG-RAM
			this.cartridge.writePRGRAM(address - 0x6000, value);
		}
		else if (address <= 0xffff) {
			//ROM、またはマッパーのレジスタ
			//this.rom[address - 0x8000] = value;
			address -= 0x8000;
			this.cartridge.writePRGROM(address, value);
		}
	}

	this.read = function(address) {
		if (address <= 0x1fff) {
			//WRAM
			return this.ram[address & 0x07FF];
		}
		else if (address <= 0x2007) {
			return this.ppu.readRegisters(address);
		}
		else if (address <= 0x3fff) {
			//PPUレジスタのミラー
			const a = address & 0x2007;
			return this.ppu.readRegisters(address & 0x2007);
		}
		else if (address <= 0x4017) {
			if (address <= 4014) {
				//open bus
				console.log(`$${address.toString(16)}: open bus`);
			}
			else if (address === 0x4015) {
				//apu
				return this.apu.readRegisters(address);
			}
			else if (address <= 0x4017) {
				return this.gamepad.read(address);
			}
		}
		else if (address <= 0x401f) {
			//CPUテストモード用
			console.log("CPUテストモード($4018-$401F)がリードされました");
			return 0;
		}
		else if (address <= 0x4777) {
			//拡張ROM
			console.log("拡張ROM($4020-$4777)がリードされました");
			return 0;
		}
		else if (address <= 0x5fff) {
			//???
			console.log("マップされていない領域($4800-$5FFF)がリードされました");
			return 0;
		}
		else if (address <= 0x7fff) {
			//拡張RAM
			const res = this.cartridge.readPRGRAM(address - 0x6000);
			return res;
			//mapper#0
			// {
			// 	const res = this.read(address & 0x1FFF);
			// 	//console.log(address.toString(16).padStart(4, 0), res.toString(2).padStart(8, 0));
			// 	return res;
			// }

			// return 0;
		}
		else if (address <= 0xffff) {
			//プログラムROM
			return this.cartridge.readPRGROM(address - 0x8000);
		}
	}

	this.fetchOpcode = function() {
		const res = this.read(this.registers.pc);
		this.registers.pc++;
		return res;
	}

	this.fetchOperand = function(rw, addressingMode) {
		switch(addressingMode) {
			case "Implied": {
				return;
			}
			case "Accumulator": {
				return;
			}
			case "Immediate": {
				const op = this.read(this.registers.pc++);

				if (this.debug_nestest) {
					this.nestestLog.operand.push(op);
				}

				return op;
			}
			case "Zeropage": {
				const lsb = this.read(this.registers.pc++);

				if (this.debug_nestest) {
					this.nestestLog.operand.push(lsb);
				}

				return lsb;
			}
			case "Zeropage,X": {
				const lower = this.read(this.registers.pc++);
				const res = (lower + this.registers.x) & 0xff;

				if (this.debug_nestest) {
					this.nestestLog.operand.push(lower);
				}

				return res;
			}
			case "Zeropage,Y": {
				const lower = this.read(this.registers.pc++);
				const res = (lower + this.registers.y) & 0xff;

				if (this.debug_nestest) {
					this.nestestLog.operand.push(lower);
				}

				return res;
			}
			case "Relative": {
				const offset = this.read(this.registers.pc++);
				let res = this.registers.pc + offset;

				if ((offset >> 7) & 1) res -= 256;
				res &= 0xFFFF;

				if (this.debug_nestest) {
					this.nestestLog.operand.push(offset);
				}

				return res;
			}
			case "Absolute": {
				//2番目のバイトを下位アドレス
				//3番目のバイトを上位アドレス
				//としたものを実行アドレスとする
				const lsb = this.read(this.registers.pc++);
				const msb = this.read(this.registers.pc++);

				if (this.debug_nestest) {
					this.nestestLog.operand.push(lsb);
					this.nestestLog.operand.push(msb);
				}

				//console.log(lsb.toString(16), msb.toString(16));

				return (msb << 8) | lsb;
			}
			case "Absolute,X": {
				//2番目のバイトを下位アドレス
				//3番目のバイトを上位アドレス
				//としてXレジスタの値を加算したものを実行アドレスとする
				const lower = this.read(this.registers.pc++);
				const upper = this.read(this.registers.pc++);
				const res = (((upper << 8) + lower) + this.registers.x) & 0xffff;

				if (this.debug_nestest) {
					this.nestestLog.operand.push(lower);
					this.nestestLog.operand.push(upper);
				}

				if (rw === "r" && ((lower + this.registers.x) & 0x100)) {
					//リード命令かつ、ページをまたぐ場合はサイクル+1
					this.addCycle = 1;
				}

				return res;
			}
			case "Absolute,Y": {
				//2番目のバイトを下位アドレス
				//3番目のバイトを上位アドレス
				//としてYレジスタの値を加算したものを実行アドレスとする
				const lower = this.read(this.registers.pc++);
				const upper = this.read(this.registers.pc++);
				const res = (((upper << 8) + lower) + this.registers.y) & 0xffff;

				if (this.debug_nestest) {
					this.nestestLog.operand.push(lower);
					this.nestestLog.operand.push(upper);
				}

				if (rw === "r" && ((lower + this.registers.y) & 0x100)) {
					//リード命令かつ、ページをまたぐ場合はサイクル+1
					this.addCycle = 1;
				}

				return res;
			}
			case "(Indirect)": {
				const op1 = this.read(this.registers.pc++);
				const op2 = this.read(this.registers.pc++);
				const addr = (op2 << 8) + op1;
				const lower = this.read(addr & 0xffff);
				//0xffバイト境界をまたぐアドレス指定は失敗する
				//(0x3ff,0x400を指定→実際には0x3ff,0x300が実効アドレスにになる)
				const upper = this.read((addr & 0xff00) + ((addr + 1) & 0xff));

				if (this.debug_nestest) {
					this.nestestLog.operand.push(op1);
					this.nestestLog.operand.push(op2);
				}

				//console.log(this.registers.pc.toString(16), upper.toString(16), lower.toString(16));


				return (upper << 8) + lower;
			}
			case "(Indirect,X)": {
				//lsb = MEMORY[$00** + X]
				//msb = MEMORY[$00** + X + 1]
				const op = this.read(this.registers.pc++);
				const lower = this.read((op + this.registers.x) & 0xff);
				const upper = this.read((op + this.registers.x + 1) & 0xff);

				if (this.debug_nestest) {
					this.nestestLog.operand.push(op);
				}

				return (upper << 8) | lower;
			}
			case "(Indirect),Y": {
				//lower = MEMORY[[$00**]] + Y
				//upper = MEMORY[[$00**] + 1]
				const op = this.read(this.registers.pc++);
				const lower = this.read(op) + this.registers.y;
				const upper = this.read((op + 1) & 0xff);
				let res = ((upper << 8) + lower) & 0xffff;

				if (rw === "r" && (lower & 0x100)) {
					//リード命令かつ、ページをまたぐ場合はサイクル数+1
					this.addCycle = 1;
				}

				if (this.debug_nestest) {
					this.nestestLog.operand.push(op);
				}

				return res;
			}
		}
	}

	this.exec = function(mnemonic, operand, mode) {
		switch (mnemonic) {
			case "LDA": {
				//メモリからAにロードします。[N.0.0.0.0.0.Z.0]
				this.registers.a = (mode === "Immediate" ? operand : this.read(operand));
				this.flags.negative = (this.registers.a & 0x80);
				this.flags.zero = !this.registers.a;
				break;
			}
			case "LDX": {
				//メモリからXにロードします。[N.0.0.0.0.0.Z.0]
				this.registers.x = (mode === "Immediate" ? operand : this.read(operand));
				this.flags.negative = (this.registers.x & 0x80);
				this.flags.zero = !this.registers.x;

				//console.log(operand.toString(16), this.read(operand));
				break;
			}
			case "LDY": {
				//メモリからYにロードします。[N.0.0.0.0.0.Z.0]
				this.registers.y = (mode === "Immediate" ? operand : this.read(operand));
				this.flags.negative = (this.registers.y & 0x80);
				this.flags.zero = !this.registers.y;
				break;
			}

			case "LAX": {
				const oepr = (mode === "Immediate" ? operand : this.read(operand));
				this.registers.a = oepr;
				this.registers.x = oepr;
				this.flags.negative = oepr & 0x80;
				this.flags.zero = !oepr;
				break;
			}

			case "STA": {
				//Aからメモリにストアします。[0.0.0.0.0.0.0.0]
				this.write(operand, this.registers.a);
				break;
			}
			case "STX": {
				//Xからメモリにストアします。[0.0.0.0.0.0.0.0]
				this.write(operand, this.registers.x);
				break;
			}
			case "STY": {
				//Yからメモリにストアします。[0.0.0.0.0.0.0.0]
				this.write(operand, this.registers.y);
				break;
			}

			case "SAX": {
				const data = this.registers.a & this.registers.x;
				this.write(operand, data);
				break;
			}

			case "TAX": {
				//AをXへコピーします。[N.0.0.0.0.0.Z.0]
				this.registers.x = this.registers.a;
				this.flags.negative = (this.registers.x & 0x80);
				this.flags.zero = !this.registers.x;
				break;
			}
			case "TAY": {
				//AをYへコピーします。[N.0.0.0.0.0.Z.0]
				this.registers.y = this.registers.a;
				this.flags.negative = (this.registers.y & 0x80);
				this.flags.zero = !this.registers.y;
				break;
			}
			case "TSX": {
				//SをXへコピーします。[N.0.0.0.0.0.Z.0]
				this.registers.x = this.registers.s;
				this.flags.negative = (this.registers.x & 0x80);
				this.flags.zero = !this.registers.x;
				break;
			}
			case "TXA": {
				//XをAへコピーします。[N.0.0.0.0.0.Z.0]
				this.registers.a = this.registers.x;
				this.flags.negative = (this.registers.a & 0x80);
				this.flags.zero = !this.registers.a;
				break;
			}
			case "TXS": {
				//XをSへコピーします。[0.0.0.0.0.0.0.0]
				this.registers.s = this.registers.x;
				break;
			}
			case "TYA": {
				//YをAへコピーします。[N.0.0.0.0.0.Z.0]
				this.registers.a = this.registers.y;
				this.flags.negative = (this.registers.a & 0x80);
				this.flags.zero = !this.registers.a;
				break;
			}
			case "ADC": {
				//(A + メモリ + キャリーフラグ) を演算して結果をAへ返します。
				//[N.V.0.0.0.0.Z.C]
				const val = (mode === "Immediate" ? operand : this.read(operand));
				const res = this.registers.a + val + (this.flags.carry ? 1 : 0);

				const signRegA = this.registers.a & 0x80;
				const signVal = val & 0x80;
				const signRes = res & 0x80;
				if (signRegA !== signVal) {
					this.flags.overflow = false;
				}
				else {
					if (signRegA !== signRes) {
						this.flags.overflow = true;
					}
					else {
						this.flags.overflow = false;
					}
				}

				this.registers.a    = res & 0xff;
				this.flags.carry    = res & 0x100;
				this.flags.zero     = !this.registers.a;
				this.flags.negative = this.registers.a & 0x80;
				break;
			}
			case "AND": {
				//Aとメモリを論理AND演算して結果をAへ返します。[N.0.0.0.0.0.Z.0]
				this.registers.a &= (mode === "Immediate" ? operand : this.read(operand));

				this.flags.negative = this.registers.a & 0x80;
				this.flags.zero = !this.registers.a;
				break;
			}
			case "ASL": {
				//Aまたはメモリを左へシフトします。[N.0.0.0.0.0.Z.C]
				if (mode === "Accumulator") {
					this.flags.carry = this.registers.a & 0x80;
					this.registers.a = (this.registers.a << 1) & 0xff;
					this.flags.negative = this.registers.a & 0x80;
					this.flags.zero = !this.registers.a;
				}
				else {
					let res = this.read(operand);

					//const a = res;

					this.flags.carry = res & 0x80;
					res = (res << 1) & 0xff;
					this.flags.negative = res & 0x80;
					this.flags.zero = !res;

					this.write(operand, res);

					//console.log(a.toString(2), "=>", res.toString(2));
				}

				break;
			}

			case "SLO": {
				this.exec("ASL", operand, mode);
				this.exec("ORA", operand, mode);
				break;
			}

			case "BIT": {
				//Aとメモリをビット比較演算します。[N.V.0.0.0.0.Z.0]
				const data = this.read(operand);
				const res = (this.registers.a & data);
				this.flags.negative = data & 0x80;
				this.flags.overflow = data & 0x40;
				this.flags.zero = !res;
				break;
			}
			case "CMP": {
				//Aとメモリを比較演算します。[N.0.0.0.0.0.Z.C]
				let res = this.registers.a - (mode === "Immediate" ? operand : this.read(operand));
				
				this.flags.negative = (res & 0x80);
				this.flags.zero = !res;
				this.flags.carry = (res >= 0);

				break;
			}
			case "CPX": {
				//Xとメモリを比較演算します。[N.0.0.0.0.0.Z.C]
				let res = this.registers.x - (mode === "Immediate" ? operand : this.read(operand));

				this.flags.negative = (res & 0x80);
				this.flags.zero = !res;
				this.flags.carry = (res >= 0);

				break;
			}
			case "CPY": {
				//Yとメモリを比較演算します。[N.0.0.0.0.0.Z.C]
				let res = this.registers.y - (mode === "Immediate" ? operand : this.read(operand));

				this.flags.negative = (res & 0x80);
				this.flags.zero = !res;
				this.flags.carry = (res >= 0);

				break;
			}
			case "DEC": {
				//メモリをデクリメントします。[N.0.0.0.0.0.Z.0]
				const res = (this.read(operand) - 1) & 0xff;
				this.flags.negative = (res & 0x80);
				this.flags.zero = !res;
				this.write(operand, res);
				break;
			}
			case "DEX": {
				//Xをデクリメントします。[N.0.0.0.0.0.Z.0]
				this.registers.x = (this.registers.x - 1) & 0xff;
				this.flags.negative = this.registers.x & 0x80;
				this.flags.zero = !this.registers.x;
				break;
			}
			case "DEY": {
				//Yをデクリメントします。[N.0.0.0.0.0.Z.0]
				this.registers.y = (this.registers.y - 1) & 0xff;
				this.flags.negative = this.registers.y & 0x80;
				this.flags.zero = !this.registers.y;
				break;
			}

			case "DCP": {
				this.exec("DEC", operand, mode);
				this.exec("CMP", operand, mode);
				break;
			}

			case "EOR": {
				//Aとメモリを論理XOR演算して結果をAへ返します。[N.0.0.0.0.0.Z.0]
				this.registers.a ^= (mode === "Immediate" ? operand : this.read(operand));
				this.flags.negative = this.registers.a & 0x80;
				this.flags.zero = !this.registers.a;
				break;
			}
			case "INC": {
				//メモリをインクリメントします。[N.0.0.0.0.0.Z.0]
				const res = (this.read(operand) + 1) & 0xff;
				this.flags.negative = res & 0x80;
				this.flags.zero = !res;

				this.write(operand, res);
				break;
			}
			case "INX": {
				//Xをインクリメントします。[N.0.0.0.0.0.Z.0]
				this.registers.x = (this.registers.x + 1) & 0xff;
				this.flags.negative = this.registers.x & 0x80;
				this.flags.zero = !this.registers.x;
				break;
			}
			case "INY": {
				//Yをインクリメントします。[N.0.0.0.0.0.Z.0]
				this.registers.y = (this.registers.y + 1) & 0xff;
				this.flags.negative = this.registers.y & 0x80;
				this.flags.zero = !this.registers.y;
				break;
			}

			case "ISB": {
				this.exec("INC", operand, mode);
				this.exec("SBC", operand, mode);
				break;
			}

			case "LSR": {
				//Aまたはメモリを右へシフトします。[N.0.0.0.0.0.Z.C]
				if (mode === "Accumulator") {
					this.flags.carry = this.registers.a & 0x01;
					this.registers.a >>= 1;
					this.flags.negative = this.registers.a & 0x80;
					this.flags.zero = !this.registers.a;
				}
				else {
					let res = this.read(operand);
					this.flags.carry = res & 0x01;
					res >>= 1;
					this.flags.negative = res & 0x80;
					this.flags.zero = !res;
					this.write(operand, res);
				}
				break;
			}

			case "SRE": {
				this.exec("LSR", operand, mode);
				this.exec("EOR", operand, mode);
				break;
			}

			case "ORA": {
				//Aとメモリを論理OR演算して結果をAへ返します。[N.0.0.0.0.0.Z.0]
				this.registers.a |= (mode === "Immediate" ? operand : this.read(operand));
				this.flags.negative = this.registers.a & 0x80;
				this.flags.zero = !this.registers.a;
				break;
			}
			case "ROL": {
				//Aまたはメモリを左へローテートします。[N.0.0.0.0.0.Z.C]

				let res;
				if (mode === "Accumulator") {
					res = this.registers.a;
				}
				else {
					res = this.read(operand);
				}
				
				const carry = (res >> 7) & 1;

				res = ((res << 1) & 0xFF) | (this.flags.carry ? 1 : 0);

				this.flags.carry = carry;
				this.flags.negative = (res >> 7) & 1;
				this.flags.zero = (res === 0);

				if (mode === "Accumulator") {
					this.registers.a = res;
				}
				else {
					this.write(operand, res);
				}
				break;

				// if (mode === "Accumulator") {
				// 	const val = this.registers.a;
				// 	const carry = val & 0x80;
				// 	const res = (val << 1) + (this.flags.carry ? 0x01 : 0x00);
				// 	this.flags.carry = carry;
				// 	this.flags.negative = res & 0x80;
				// 	this.flags.zero = !res;
				// 	this.registers.a = res & 0xff;
				// }
				// else {
				// 	const val = this.read(operand);
				// 	const carry = val & 0x80;
				// 	const res = (val << 1) + (this.flags.carry ? 0x01 : 0x00);
				// 	this.flags.carry = carry;
				// 	this.flags.negative = res & 0x80;
				// 	this.flags.zero = !res;
				// 	this.write(operand, res & 0xff);
				// }
				// break;
			}
			case "ROR": {
				//Aまたはメモリを右へローテートします。
				//[N.0.0.0.0.0.Z.C]
				if (mode === "Accumulator") {
					const val = this.registers.a;
					const carry = val & 0x01;
					const res = (val >> 1) + (this.flags.carry ? 0x80 : 0x00);
					this.flags.carry = carry;
					this.flags.negative = res & 0x80;
					this.flags.zero = !res;
					this.registers.a = res & 0xff;
				}
				else {
					const val = this.read(operand);
					const carry = val & 0x01;
					const res = (val >> 1) + (this.flags.carry ? 0x80 : 0x00);
					this.flags.carry = carry;
					this.flags.negative = res & 0x80;
					this.flags.zero = !res;
					this.write(operand, res & 0xff);
				}
				break;
			}

			case "RLA": {
				this.exec("ROL", operand, mode);
				this.exec("AND", operand, mode);
				break;
			}

			case "RRA": {
				this.exec("ROR", operand, mode);
				this.exec("ADC", operand, mode);
				break;
			}

			case "SBC": {
				//(A - メモリ - キャリーフラグの反転) を演算して結果をAへ返します。
				//[N.V.0.0.0.0.Z.C]
				const val = (mode === "Immediate" ? operand : this.read(operand));
				const res = this.registers.a - val - (this.flags.carry ? 0 : 1);

				const signRegA = this.registers.a & 0x80;
				const signVal = val & 0x80;
				const signRes = res & 0x80;
				if (signRegA === signVal) {
					this.flags.overflow = false;
				}
				else {
					if (signRegA !== signRes) {
						this.flags.overflow = true;
					}
					else {
						this.flags.overflow = false;
					}
				}

				this.registers.a    = res & 0xff;
				this.flags.carry    = !(res & 0x100);
				this.flags.zero     = !this.registers.a;
				this.flags.negative = this.registers.a & 0x80;
				break;
			}

			case "PHA": {
				//Aをスタックにプッシュダウンします。
				this.write(this.registers.s + 0x100, this.registers.a);
				this.registers.s--;
				this.registers.s &= 0xFF;
				break;
			}
			case "PHP": {
				//Pをスタックにプッシュダウンします。
				//breakフラグをセットした状態でpushする
				
				//this.write(this.registers.s + 0x100, this.registers.p | 0x10);
				let p = this.fetchProcessorStatus();
				this.write(this.registers.s + 0x100, p | (1 << 4));

				this.registers.s--;
				this.registers.s &= 0xFF;
				break;
			}
			case "PLA": {
				//スタックからAにポップアップします。
				//[N.0.0.0.0.0.Z.0]
				this.registers.s++;
				this.registers.s &= 0xFF;
				this.registers.a = this.read(this.registers.s + 0x100);

				this.flags.negative = this.registers.a & 0x80;
				this.flags.zero = !this.registers.a;
				break;
			}
			case "PLP": {
				//スタックからPにポップアップします。
				//[N.V.R.B.D.I.Z.C]
				this.registers.s++;
				this.registers.s &= 0xFF;

				//this.registers.p        = this.read(this.registers.s + 0x100);
				//this.registers.p        = this.read(this.registers.s + 0x100) & 0xEF;
				const p = this.read(this.registers.s + 0x100) & 0xEF;

				this.flags.carry        = p & 0x01;
				this.flags.zero         = p & 0x02;
				this.flags.interrupt    = p & 0x04;
				this.flags.decimal      = p & 0x08;
				this.flags.break        = p & 0x10;
				this.flags.overflow     = p & 0x40;
				this.flags.negative     = p & 0x80;

				break;
			}
			case "JMP": {
				//アドレスへジャンプします。
				//[0.0.0.0.0.0.0.0]
				//console.log(`jump to ${operand.toString(16)}`);
				this.registers.pc = operand;
				break;
			}
			case "JSR": {
				//サブルーチンを呼び出します。
				const addr = this.registers.pc - 1;
				const upper = addr >> 8;
				const lower = addr & 0xff;

				this.write(this.registers.s + 0x100, upper);
				this.registers.s--;
				this.registers.s &= 0xFF;

				this.write(this.registers.s + 0x100, lower);
				this.registers.s--;
				this.registers.s &= 0xFF;

				this.registers.pc = operand;
				break;
			}
			case "RTS": {
				//サブルーチンから復帰します。
				this.registers.s++;
				this.registers.s &= 0xFF;
				const lower = this.read(this.registers.s + 0x100);

				this.registers.s++;
				this.registers.s &= 0xFF;
				const upper = this.read(this.registers.s + 0x100);

				this.registers.pc = ((upper << 8) | lower) + 1;
				break;
			}
			case "RTI": {
				//割り込みルーチンから復帰します。
				//[N.V.R.B.D.I.Z.C]
				this.registers.s++;
				this.registers.s &= 0xFF;

				//this.registers.p        = this.read(this.registers.s + 0x100);
				// this.registers.p        = this.read(this.registers.s + 0x100) & 0xEF;

				// this.flags.carry        = (this.registers.p >> 0) & 1;
				// this.flags.zero         = (this.registers.p >> 1) & 1;
				// this.flags.interrupt    = (this.registers.p >> 2) & 1;
				// this.flags.decimal      = (this.registers.p >> 3) & 1;
				// this.flags.break        = (this.registers.p >> 4) & 1;
				// this.flags.overflow     = (this.registers.p >> 6) & 1;
				// this.flags.negative     = (this.registers.p >> 7) & 1;

				const p = this.read(this.registers.s + 0x100) & 0xEF;
				this.flags.carry        = (p >> 0) & 1;
				this.flags.zero         = (p >> 1) & 1;
				this.flags.interrupt    = (p >> 2) & 1;
				this.flags.decimal      = (p >> 3) & 1;
				this.flags.break        = (p >> 4) & 1;
				this.flags.overflow     = (p >> 6) & 1;
				this.flags.negative     = (p >> 7) & 1;

				//割込みポーリング前にIフラグを復元することを考慮
				//https://www.nesdev.org/wiki/CPU_interrupts
				this.pollingInterrupt();

				this.registers.s++;
				this.registers.s &= 0xFF;
				const lower = this.read(this.registers.s + 0x100);

				this.registers.s++;
				this.registers.s &= 0xFF;
				const upper = this.read(this.registers.s + 0x100);
				this.registers.pc = (upper << 8) | lower;
				
				break;
			}

			//条件分岐
			case "BCC": {
				if (!this.flags.carry) {
					const opPage = operand & 0xff00;
					const pcPage = this.registers.pc & 0xff00;
					this.addCycle = (opPage === pcPage ? 1 : 2);

					this.registers.pc = operand;
				}
				break;
			}
			case "BCS": {
				if (this.flags.carry) {
					const opPage = operand & 0xff00;
					const pcPage = this.registers.pc & 0xff00;
					this.addCycle = (opPage === pcPage ? 1 : 2);

					this.registers.pc = operand;
				}
				break;
			}
			case "BEQ": {
				if (this.flags.zero) {
					const opPage = operand & 0xff00;
					const pcPage = this.registers.pc & 0xff00;
					this.addCycle = (opPage === pcPage ? 1 : 2);

					this.registers.pc = operand;

					//console.log("BEQ", this.registers.pc.toString(16));
				}
				break;
			}
			case "BMI": {
				if (this.flags.negative) {
					const opPage = operand & 0xff00;
					const pcPage = this.registers.pc & 0xff00;
					this.addCycle = (opPage === pcPage ? 1 : 2);

					this.registers.pc = operand;
				}
				break;
			}
			case "BNE": {
				if (!this.flags.zero) {
					const opPage = operand & 0xff00;
					const pcPage = this.registers.pc & 0xff00;
					this.addCycle = (opPage === pcPage ? 1 : 2);

					this.registers.pc = operand;
				}
				break;
			}
			case "BPL": {
				if (!this.flags.negative) {
					const opPage = operand & 0xff00;
					const pcPage = this.registers.pc & 0xff00;
					this.addCycle = (opPage === pcPage ? 1 : 2);

					this.registers.pc = operand;
				}
				break;
			}
			case "BVC": {
				if (!this.flags.overflow) {
					const opPage = operand & 0xff00;
					const pcPage = this.registers.pc & 0xff00;
					this.addCycle = (opPage === pcPage ? 1 : 2);

					this.registers.pc = operand;
				}
				break;
			}
			case "BVS": {
				if (this.flags.overflow) {
					const opPage = operand & 0xff00;
					const pcPage = this.registers.pc & 0xff00;
					this.addCycle = (opPage === pcPage ? 1 : 2);

					this.registers.pc = operand;
				}
				break;
			}

			//フラグ操作
			case "CLC": {
				this.flags.carry = false;
				break;
			}
			case "CLD": {
				this.flags.decimal = false;
				break;
			}
			case "CLI": {
				//console.log("CLI I flag: ", this.flags.interrupt);
				this.flags.interrupt = false;
				break;
			}
			case "CLV": {
				this.flags.overflow = false;
				break;
			}
			case "SEC": {
				this.flags.carry = true;
				break;
			}
			case "SED": {
				this.flags.decimal = true;
				break;
			}
			case "SEI": {
				this.flags.interrupt = true;
				break;
			}

			//割込み
			case "BRK": {
				//breakフラグを設定
				//this.assertInterrupt("BRK");
				//this.assertInterruptBRK = 1;

				//パディングバイトフェッチ
				this.fetchOpcode();

				//console.log(this.registers.pc.toString(16));

				//PCの上位バイトをスタックにプッシュ
				let upper = (this.registers.pc >> 8) & 0xff;
				this.write(this.registers.s + 0x100, upper);
				this.registers.s--;
				this.registers.s &= 0xFF;

				//PCの下位バイトをスタックにプッシュ
				let lower = this.registers.pc & 0xff;
				this.write(this.registers.s + 0x100, lower);
				this.registers.s--;
				this.registers.s &= 0xFF;

				//ステータスレジスタをスタックにプッシュ(BRKフラグをセット)

				
				//const p = this.registers.p | (1 << 4);
				const p = this.fetchProcessorStatus();
				this.write(this.registers.s + 0x100, p | (1 << 4));
				this.registers.s--;
				this.registers.s &= 0xFF;

				//割込み無効
				//this.registers.p |= (1 << 2);
				this.flags.interrupt = true;

				//割込みハンドラのアドレスをフェッチ
				lower = this.read(0xFFFE);
				upper = this.read(0xFFFF);
				this.registers.pc = (upper << 8) | lower;

				//this.assertInterruptBRK = 0;

				break;
			}

			//非公式
			case "ANC": {
				this.registers.a &= operand;
				this.flags.negative = (this.registers.a >> 7) & 1;
				this.flags.zero = (this.registers.a === 0);
				this.flags.carry = (this.registers.a >> 7) & 1;
				break;
			}

			case "ALR": {
				let res = this.registers.a & operand;
				
				this.flags.carry = res & 1;
				res >>= 1;

				this.registers.a = res;
				this.flags.negative = (res >> 7) & 1;
				this.flags.zero = (res === 0);

				break;
			}

			case "ARR": {
				if (this.flags.decimal) {
					//decimal mode
					let a = this.registers.a;
					let c = (this.flags.carry ? 1 : 0);
					let t = (a & operand) | 0xFF;
					
					// const ah = (t >> 4) & 0x0F;
					// const al = t & 0x0F;
					const ah = (operand >> 4) & 0x0F;
					const al = operand & 0x0F;

					this.flags.negative = (c > 0);

					a = (t >> 1) | (c << 7);
					this.flags.zero = (a === 0);
					//this.flags.overflow = ((t ^ a) >> 6) & 1;
					this.flags.overflow = ((a ^ operand) >> 6) & 1;

					if ((al + (al & 1)) > 5) {
						a = (a & 0xF0) | ((a + 6) & 0x0F);
					}

					this.flags.carry = ((ah + (ah & 1)) > 5);
					if (this.flags.carry) {
						a = (a + 0x60) & 0xFF;
					}

					this.registers.a = a;
				}
				else {
					//binary mode
					let c = this.flags.carry;
					let a = (this.registers.a & operand) | 0xFF;
					a = (a >> 1) | (c << 7);

					this.flags.negative = c;
					this.flags.zero = (a === 0);

					this.flags.overflow = ((a >> 6) ^ (a >> 5)) & 1;
					this.flags.carry = (a >> 6) & 1;

					this.registers.a = a;
				}

				// {
				// 	let flag = this.flags.negative << 7;
				// 	flag |= this.flags.overflow << 6;
				// 	flag |= 1 << 5;
				// 	flag |= this.flags.break << 4;
				// 	flag |= this.flags.decimal << 3;
				// 	flag |= this.flags.interrupt << 2;
				// 	flag |= this.flags.zero << 1;
				// 	flag |= this.flags.carry << 0;
				// 	console.log(this.registers.a.toString(16).padStart(2, 0), flag.toString(2).padStart(8, 0))
				// }

				break;
			}

			case "ANE": {
				const magicConstant = 0xFF;

				this.registers.a |= magicConstant;
				this.registers.a &= this.registers.x;
				this.registers.a &= operand;

				this.flags.negative = (this.registers.a >> 7) & 1;
				this.flags.zero = (this.registers.a === 0);

				break;
			}

			case "LAX": {
				const magicConstant = 0xFF;

				let res = this.registers.a;
				res |= magicConstant;
				res &= operand;

				this.registers.a = res;
				this.registers.x = res;
				
				this.flags.negative = (res >> 7) & 1;
				this.flags.zero = (res === 0);
				
				break;
			}

			case "SBX": {
				let res = this.registers.x;
				res &= this.registers.a;
				res -= operand;

				this.flags.negative = (res >> 7) & 1;
				this.flags.zero = (res === 0);

				//引き算の場合、キャリーフラグ(ボローフラグ)は負論理
				this.flags.carry = ~(res >> 8) & 1;
				this.registers.x = res & 0xFF;

				break;
			}

			case "JAM": {
				console.log("!!!!!CPU HALT!!!!!");
				break;
			}

			// case "USBC": {
			// 	let res = this.registers.a;
			// 	res -= oepr;
			// 	res -= !this.flags.carry;

			// 	const signA = (this.registers.a >> 7) & 1;
			// 	const signB = (res >> 7) & 1;
			// 	this.flags.overflow = (signA != signB);

			// 	this.flags.negative = (res >> 7) & 1;
			// 	this.flags.zero = (res === 0);
			// 	this.flags.carry = (res >> 8) & 1;

			// 	break;
			// }

			case "SHY": {
				const addr = this.nestestLog.operand[1];
				const res = this.registers.y & (addr + 1);
				if (addr + this.registers.x <= 0xFF) this.write(operand, res);

				break;
			}

			case "SHX": {
				const addr = this.nestestLog.operand[1];
				const res = this.registers.x & (addr + 1);
				if (addr + this.registers.y <= 0xFF) this.write(operand, res);

				break;
			}

			case "SHA": {
				const addr = this.nestestLog.operand[1];
				let res = this.registers.a & this.registers.x & (addr + 1);

				this.write(operand, res);
				break;
			}

			case "LAS": {
				
				let p = this.fetchProcessorStatus();
				// if (this.flags.negative) p |= (1 << 7);
				// if (this.flags.overflow) p |= (1 << 6);
				// if (this.flags.reserved) p |= (1 << 5);
				// if (this.flags.break) p |= (1 << 4);
				// if (this.flags.decimal) p |= (1 << 3);
				// if (this.flags.interrupt) p |= (1 << 2);
				// if (this.flags.zero) p |= (1 << 1);
				// if (this.flags.carry) p |= (1 << 0);

				//let res = this.read(operand) & this.registers.p;
				//this.registers.a = this.registers.x = this.registers.p = res & 0xff;

				let res = this.read(operand) & p;
				this.registers.a = this.registers.x = res & 0xff;

				this.flags.negative = (res >> 7) & 1;
				this.flags.zero = (res === 0);

				this.write(operand, res);
				break;
			}

			default: {
				//"NOP"
				break;
			}
		}

		//ステータスレジスタを反映
		// let bit = 7, nextStatusRegister = 0;
		// for (const prop in this.flags) {
		// 	this.flags[prop] = Boolean(this.flags[prop]);
		// 	nextStatusRegister |= this.flags[prop] << bit;
		// 	bit--;
		// }
		// this.registers.p = nextStatusRegister;

		{
			// let p = 0;
			//this.flags.negative = (this.flags.negative ? 1 : 0);
			//this.flags.overflow = (this.flags.overflow ? 1 : 0);
			//this.flags.reserved = (this.flags.reserved ? 1 : 0);
			//this.flags.break = (this.flags.break ? 1 : 0);
			//this.flags.decimal = (this.flags.decimal ? 1 : 0);
			//this.flags.interrupt = (this.flags.interrupt ? 1 : 0);
			//this.flags.zero = (this.flags.zero ? 1 : 0);
			//this.flags.carry = (this.flags.carry ? 1 : 0);

			// if (this.flags.negative) p |= (1 << 7);
			// if (this.flags.overflow) p |= (1 << 6);
			// if (this.flags.reserved) p |= (1 << 5);
			// if (this.flags.break) p |= (1 << 4);
			// if (this.flags.decimal) p |= (1 << 3);
			// if (this.flags.interrupt) p |= (1 << 2);
			// if (this.flags.zero) p |= (1 << 1);
			// if (this.flags.carry) p |= (1 << 0);
			// this.registers.p = p;
		}
	}

	//前回の命令でメモリアクセス時にページ境界を越えたときに+1サイクルする
	this.waitCycle = 0;
	this.addCycle = 0;

	this.breakpoint1 = 0;
	this.breakpoint2 = 0;

	this.run = function(cpuCycle, frame) {
		if (this.cpuHalt) {
			if (this.DMCDMAFlag) {
				this.DMCDMAHandler();
			}
			else if (this.OAMDMAFlag) {
				this.OAMDMAHandler();
			}

			if (!this.DMCDMAFlag && !this.OAMDMAFlag) {
				this.cpuHalt = 0;
			}
		}
		else if (this.interruptFlag === 1) {
			//割込み処理
			this.waitCycle--;

			this.cpuReadCycle = 1;
			if (2 <= this.waitCycle && this.waitCycle <= 4) {
				this.cpuReadCycle = 0;
			}

			if (this.waitCycle === 0) {
				this.interruptHandler();
			}
		}
		else {
			//cpuのread/writeサイクルを確認
			{
				this.cpuReadCycle = 1;

				this.waitCycle--;
				switch (this.mnemonic) {
					case "BRK": {
						if (2 <= this.waitCycle && this.waitCycle <= 4) {
							this.cpuReadCycle = 0;
						}
						break;
					}
					
					case "PHA":
					case "PHP":
					{
						if (this.waitCycle === 0) {
							this.cpuReadCycle = 0;
						}
						break;
					}
					
					case "JSR": {
						if (1 <= this.waitCycle && this.waitCycle <= 2) {
							this.cpuReadCycle = 0;
						}
						break;
					}
					
					//読み込み、変更、書き込み
					case "ASL":
					case "LSR":
					case "ROL":
					case "ROR":
					case "INC":
					case "DEC":
					case "SLO":
					case "SRE":
					case "RLA":
					case "RRA":
					case "ISB":
					case "DCP":
					{
						if (this.waitCycle <= 1) {
							this.cpuReadCycle = 0;
						}
						break;
					}

					//書き込み命令
					case "STA":
					case "STX":
					case "STY":
					case "SAX":
					case "SHA":
					case "SHX":
					case "SHY":
					{
						if (this.waitCycle === 0) {
							this.cpuReadCycle = 0;
						}
						break;
					}
				}
				this.waitCycle++;

				//DMA要求あり時、CPU停止を試行
				if (this.DMCDMAFlag || this.OAMDMAFlag) {
					if (this.cpuReadCycle) {
						this.cpuHalt = 1;
					}
				}
			}

			if (!this.cpuHalt) {
				if (this.opcode === undefined) {
					if (this.waitCycle === 0) {
						//nestest用
						if (this.debug_nestest) {
							this.nestestLog.pc = this.registers.pc;
						}
						
						//命令フェッチ
						this.opcode = this.fetchOpcode();
						//if (this.opcode === undefined) {
						// if (1) {
						// 	console.log(`${this.registers.pc.toString(16)} ${this.opcode.toString(16)}`);
						// }
						
						try {
							const {mnemonic, rw, mode, cycle} = opcodeList[this.opcode];
		
							this.mnemonic = mnemonic;
							this.rw = rw;
							this.addressing = mode;
							this.waitCycle = cycle + this.addCycle;
							this.addCycle = 0;
		
							if (this.debug_nestest) {
								this.nestestLog.cycTemp = this.waitCycle;
							}
						}
						catch (err) {
							console.error(err);

							for (let i = 0, len = this.logs.length; i < len; i++) {
								console.log(this.logs[i]);
							}

							console.error(this.registers.pc.toString(16), this.ram);
						}
					}
				}
				
				//命令の実行サイクル経過するまで待機
				this.waitCycle--;
				if (this.waitCycle === 0) {
					if (this.debug_nestest) {
						this.nestestLog.opcode = this.opcode;
						this.nestestLog.mnemonic = this.mnemonic;
						this.nestestLog.a = this.registers.a;
						this.nestestLog.x = this.registers.x;
						this.nestestLog.y = this.registers.y;
						this.nestestLog.p = this.registers.p;
						this.nestestLog.sp = this.registers.s;
					}
	
					//割込みポーリング→命令実行の順？
					this.opcode = undefined;
					this.pollingInterrupt();

					//オペランドをフェッチし、命令を実行
					let operand = this.fetchOperand(this.rw, this.addressing);	
					this.exec(this.mnemonic, operand, this.addressing);
					
					if (this.debug_nestest) {
						let log = "";

						const pc = this.nestestLog.pc;
						log += `${pc === undefined ? "????" : pc.toString(16).padStart(4, 0)}\t`;
						const opcode = this.nestestLog.opcode;
						log += `${opcode === undefined ? "???" : opcode.toString(16).padStart(2, 0)}\t`;
						const operand0 = this.nestestLog.operand[0];
						log += `${operand0 === undefined ? "  " : operand0.toString(16).padStart(2, 0)}\t`;
						const operand1 = this.nestestLog.operand[1];
						log += `${operand1 === undefined ? "  " : operand1.toString(16).padStart(2, 0)}\t`;
						const mnemonic = this.nestestLog.mnemonic;
						log += `${mnemonic === undefined ? "???" : mnemonic}\t\t`;
						const a = this.nestestLog.a;
						log += `a:${a === undefined ? "??" : a.toString(16).padStart(2, 0)}\t`;
						const x = this.nestestLog.x;
						log += `x:${x === undefined ? "??" : x.toString(16).padStart(2, 0)}\t`;
						const y = this.nestestLog.y;
						log += `y:${y === undefined ? "??" : y.toString(16).padStart(2, 0)}\t`;
						const p = this.nestestLog.p;
						log += `p:${p === undefined ? "??" : p.toString(16).padStart(2, 0)}\t`;
						const sp = this.nestestLog.sp;
						log += `sp:${sp === undefined ? "??" : sp.toString(16).padStart(2, 0)}\t`;
						log += `${cpuCycle.toString(10).padStart(5)}\t`;
						
						this.logs.push(log);
						if (this.logs.length > 8) this.logs.shift();

						console.log(log);

						this.nestestLog.operand = [];
					}
				}
			}
		}

		this.updateInterrupt();

		this.cpuOddCycle ^= 1;
	}

	///// 割り込み //////
	//ppuからvblank発生時にアサートされる
	//1:NMI 2:RESET 4:IRQ/BRK

	//ppuから割込み発生したらフラグを立てる
	//cpuが命令実行完了時にフラグをポーリングする
	this.interruptFlag = 0;
	this.interruptType = "NONE";

	this.assertInterruptNMI = 0;
	this.assertInterruptReset = 0;
	//this.assertInterruptBRK = 0;

	this.cpuOddCycle = 0;
	this.cpuReadCycle = 0;
	this.assertIRQFlagBuffer = 0;

	this.assertIRQFlag = 0;
	this.assertIRQ = function(flag) {
		//this.assertIRQFlag = flag;
		this.assertIRQFlagBuffer = flag;
		//console.log("assertIRQ", this.assertIRQFlagBuffer);
	}

	this.updateInterrupt = function() {
		if (this.cpuOddCycle) {
			this.assertIRQFlag = this.assertIRQFlagBuffer;
			//console.log(this.assertIRQFlagBuffer);
		}
	}

	this.pollingInterrupt = function() {
		//nmi割り込みはエッジ検出
		const nmi = this.ppu.pollingInterrupt();
		const prevnmi = this.assertInterruptNMI;
		const assertInterruptNMI = ~this.assertInterruptNMI & nmi;
		this.assertInterruptNMI = prevnmi;

		if (this.assertInterruptReset) {
			//reset
			this.interruptFlag = 1;
			this.interruptType = "RESET";
			this.waitCycle = 7;
		}
		else if (assertInterruptNMI) {
			//nmi
			this.interruptFlag = 1;
			this.interruptType = "NMI";
			this.waitCycle = 7;
		}
		else if (this.interruptType === "NONE" && !this.flags.interrupt && (this.assertIRQFlag || this.cartridge.mapper.assertIRQ())) {
			//irq
			this.interruptFlag = 1;
			this.interruptType = "IRQ";
			this.waitCycle = 7;
		}
	}

	this.interruptHandler = function() {
		if (this.interruptType === "NMI") {
			//PC、ステータスレジスタをスタックに退避
			let upper = (this.registers.pc >> 8) & 0xff;
			this.write(this.registers.s + 0x100, upper);
			this.registers.s--;
			this.registers.s &= 0xFF;

			let lower = this.registers.pc & 0xff;
			this.write(this.registers.s + 0x100, lower);
			this.registers.s--;
			this.registers.s &= 0xFF;
			
			//Bフラグをクリア
			//this.registers.p &= ~(1 << 4);
			this.flags.break = false;

			const p = this.fetchProcessorStatus();
			this.write(this.registers.s + 0x100, p);
			this.registers.s--;
			this.registers.s &= 0xFF;
			
			//割込み無効
			//this.registers.p |= (1 << 2);
			this.flags.interrupt = true;

			//割込みハンドラのアドレスをフェッチ
			lower = this.read(0xFFFA);
			upper = this.read(0xFFFB);
			this.registers.pc = (upper << 8) | lower;
		}
		else if (this.interruptType === "RESET") {
			//リセット時はスタックポインタのデクリメントのみ
			this.registers.s -= 3;
			this.registers.s &= 0xFF;

			//Bフラグをクリア
			//this.registers.p &= ~(1 << 4);
			this.flags.break = false;

			//割込み無効
			//this.registers.p |= (1 << 2);
			this.flags.interrupt = true;

			//割込みハンドラのアドレスをフェッチ
			const lower = this.read(0xFFFC);
			const upper = this.read(0xFFFD);
			this.registers.pc = (upper << 8) | lower;
			
			this.assertInterruptReset = 0;
		}
		else if (this.interruptType === "IRQ") {
			//console.log("IRQ割込み処理遷移");
			
			//PCの上位バイトをスタックにプッシュ
			let upper = (this.registers.pc >> 8) & 0xff;
			this.write(this.registers.s + 0x100, upper);
			this.registers.s--;
			this.registers.s &= 0xFF;

			//PCの下位バイトをスタックにプッシュ
			let lower = this.registers.pc & 0xff;
			this.write(this.registers.s + 0x100, lower);
			this.registers.s--;
			this.registers.s &= 0xFF;
			
			//Bフラグをクリア
			//this.registers.p &= ~(1 << 4);
			this.flags.break = false;

			//ステータスレジスタをスタックにプッシュ
			const p = this.fetchProcessorStatus();
			this.write(this.registers.s + 0x100, p);
			this.registers.s--;
			this.registers.s &= 0xFF;
			
			//割込み無効
			//this.registers.p |= (1 << 2);
			this.flags.interrupt = true;

			//割込みハンドラのアドレスをフェッチ
			lower = this.read(0xFFFE);
			upper = this.read(0xFFFF);
			this.registers.pc = (upper << 8) | lower;

			//this.assertIRQFlag = 0;
		}
		this.interruptFlag = 0;
		
		this.interruptType = "NONE";
	}
	
	///// DMA /////
	this.cpuHalt = 0;

	///// OAM DMA /////
	this.OAMDMAFlag = 0;
	this.OAMDMAAddress = 0;
	this.OAMDMAHaltCycle = 0;
	this.alignmentCycle = 0;

	this.assertOAMDMA = function(address) {
		this.OAMDMAFlag = 1;
		this.OAMDMAAddress = (address << 8);
	}

	this.OAMDMAHandler = function() {
		if (!this.OAMDMAHaltCycle) {
			this.OAMDMAHaltCycle = 1;
			this.alignmentCycle = !this.cpuOddCycle;
		}
		else if (!this.alignmentCycle) {
			this.alignmentCycle = 1;
		}
		else {
			if (this.cpuOddCycle) {
				//put
				const data = this.read(this.OAMDMAAddress++);
				this.write(0x2004, data);
				if ((this.OAMDMAAddress & 0xFF) === 0) {
					this.OAMDMAFlag = 0;
				}
			}
			else {
				//get
			}
		}
	}

	///// DMC DMA /////
	this.DMCDMAFlag = 0;
	this.DMCDMAHaltCycle = 0;
	this.DMCDMAAddress = 0;
	this.dummyCycle = 0;
	
	this.assertDMCDMA = function(address) {
		this.DMCDMAFlag = 1;
		this.DMCDMAAddress = address;
		this.DMCDMAHaltCycle = 0;
		this.dummyCycle = 0;
	}

	this.DMCDMAHandler = function() {
		if (!this.DMCDMAHaltCycle) {
			this.DMCDMAHaltCycle = 1;
		}
		else if (!this.dummyCycle) {
			this.dummyCycle = 1;
		}
		else {
			if (this.cpuOddCycle) {
				//アライメントサイクル
			}
			else {
				const data = this.read(this.DMCDMAAddress);
				this.apu.dmc.setSampleBuffer(data);
				this.DMCDMAFlag = 0;
				this.alignmentCycle = !this.cpuOddCycle;
			}
		}
	}
};

const opcodeList = {
	0x00: { mnemonic: "BRK", rw: "-",	mode: "Implied",		cycle: 7},
	0x01: { mnemonic: "ORA", rw: "r",	mode: "(Indirect,X)",	cycle: 6},
	0x02: { menmonic: "JAM", rw: "-",	mode: "-",				cycle: 0}, 
	0x03: { mnemonic: "SLO", rw: "-",	mode: "(Indirect,X)",	cycle: 8},
	0x04: { mnemonic: "NOP", rw: "r",	mode: "Zeropage",		cycle: 3},
	0x05: { mnemonic: "ORA", rw: "r",	mode: "Zeropage",		cycle: 3},
	0x06: { mnemonic: "ASL", rw: "-",	mode: "Zeropage",		cycle: 5},
	0x07: { mnemonic: "SLO", rw: "-",	mode: "Zeropage",		cycle: 5},
	0x08: { mnemonic: "PHP", rw: "-",	mode: "Implied",		cycle: 3},
	0x09: { mnemonic: "ORA", rw: "r",	mode: "Immediate",		cycle: 2},
	0x0A: { mnemonic: "ASL", rw: "-",	mode: "Accumulator", 	cycle: 2},
	0x0B: { mnemonic: "ANC", rw: "-",	mode: "Immediate", 		cycle: 2},
	0x0C: { mnemonic: "NOP", rw: "r",	mode: "Absolute",		cycle: 4},
	0x0D: { mnemonic: "ORA", rw: "r",	mode: "Absolute",		cycle: 4},
	0x0E: { mnemonic: "ASL", rw: "-",	mode: "Absolute",		cycle: 6},
	0x0F: { mnemonic: "SLO", rw: "-",	mode: "Absolute",		cycle: 6},
	0x10: { mnemonic: "BPL", rw: "-",	mode: "Relative",		cycle: 2},
	0x12: { menmonic: "JAM", rw: "-",	mode: "-",				cycle: 0}, 
	0x11: { mnemonic: "ORA", rw: "r",	mode: "(Indirect),Y",	cycle: 5},
	0x13: { mnemonic: "SLO", rw: "-",	mode: "(Indirect),Y",	cycle: 8},
	0x14: { mnemonic: "NOP", rw: "r",	mode: "Zeropage,X",		cycle: 4},
	0x15: { mnemonic: "ORA", rw: "r",	mode: "Zeropage,X",		cycle: 4},
	0x16: { mnemonic: "ASL", rw: "-",	mode: "Zeropage,X",		cycle: 6},
	0x17: { mnemonic: "SLO", rw: "-",	mode: "Zeropage,X",		cycle: 6},
	0x18: { mnemonic: "CLC", rw: "-",	mode: "Implied",		cycle: 2},
	0x19: { mnemonic: "ORA", rw: "r",	mode: "Absolute,Y",		cycle: 4},
	0x1A: { mnemonic: "NOP", rw: "r",	mode: "Implied",		cycle: 2},
	0x1B: { mnemonic: "SLO", rw: "-",	mode: "Absolute,Y",		cycle: 7},
	0x1C: { mnemonic: "NOP", rw: "r",	mode: "Absolute,X",		cycle: 4},
	0x1D: { mnemonic: "ORA", rw: "r",	mode: "Absolute,X",		cycle: 4},
	0x1E: { mnemonic: "ASL", rw: "-",	mode: "Absolute,X",		cycle: 7},
	0x1F: { mnemonic: "SLO", rw: "-",	mode: "Absolute,X",		cycle: 7},
	0x20: { mnemonic: "JSR", rw: "-",	mode: "Absolute",		cycle: 6},
	0x21: { mnemonic: "AND", rw: "r",	mode: "(Indirect,X)",	cycle: 6},
	0x22: { menmonic: "JAM", rw: "-",	mode: "-",				cycle: 0}, 
	0x23: { mnemonic: "RLA", rw: "-",	mode: "(Indirect,X)",	cycle: 8},
	0x24: { mnemonic: "BIT", rw: "r",	mode: "Zeropage",		cycle: 3},
	0x25: { mnemonic: "AND", rw: "r",	mode: "Zeropage",		cycle: 3},
	0x26: { mnemonic: "ROL", rw: "-",	mode: "Zeropage",		cycle: 5},
	0x27: { mnemonic: "RLA", rw: "-",	mode: "Zeropage",		cycle: 5},
	0x28: { mnemonic: "PLP", rw: "-",	mode: "Implied",		cycle: 4},
	0x29: { mnemonic: "AND", rw: "r",	mode: "Immediate",		cycle: 2},
	0x2A: { mnemonic: "ROL", rw: "-",	mode: "Accumulator", 	cycle: 2},
	0x2B: { mnemonic: "ANC", rw: "-",	mode: "Immediate", 		cycle: 2},
	0x2C: { mnemonic: "BIT", rw: "r",	mode: "Absolute",		cycle: 4},
	0x2D: { mnemonic: "AND", rw: "r",	mode: "Absolute",		cycle: 4},
	0x2E: { mnemonic: "ROL", rw: "-",	mode: "Absolute",		cycle: 6},
	0x2F: { mnemonic: "RLA", rw: "-",	mode: "Absolute",		cycle: 6},
	0x30: { mnemonic: "BMI", rw: "-",	mode: "Relative",		cycle: 2},
	0x31: { mnemonic: "AND", rw: "r",	mode: "(Indirect),Y",	cycle: 5},
	0x32: { menmonic: "JAM", rw: "-",	mode: "-",				cycle: 0}, 
	0x33: { mnemonic: "RLA", rw: "-",	mode: "(Indirect),Y",	cycle: 8},
	0x34: { mnemonic: "NOP", rw: "r",	mode: "Zeropage,X",		cycle: 4},
	0x35: { mnemonic: "AND", rw: "r",	mode: "Zeropage,X",		cycle: 4},
	0x36: { mnemonic: "ROL", rw: "-",	mode: "Zeropage,X",		cycle: 6},
	0x37: { mnemonic: "RLA", rw: "-",	mode: "Zeropage,X",		cycle: 6},
	0x38: { mnemonic: "SEC", rw: "-",	mode: "Implied",		cycle: 2},
	0x39: { mnemonic: "AND", rw: "r",	mode: "Absolute,Y",		cycle: 4},
	0x3A: { mnemonic: "NOP", rw: "r",	mode: "Implied",		cycle: 2},
	0x3B: { mnemonic: "RLA", rw: "-",	mode: "Absolute,Y",		cycle: 7},
	0x3C: { mnemonic: "NOP", rw: "r",	mode: "Absolute,X",		cycle: 4},
	0x3D: { mnemonic: "AND", rw: "r",	mode: "Absolute,X",		cycle: 4},
	0x3E: { mnemonic: "ROL", rw: "-",	mode: "Absolute,X",		cycle: 7},
	0x3F: { mnemonic: "RLA", rw: "-",	mode: "Absolute,X",		cycle: 7},
	0x40: { mnemonic: "RTI", rw: "-",	mode: "Implied",		cycle: 6},
	0x41: { mnemonic: "EOR", rw: "r",	mode: "(Indirect,X)",	cycle: 6},
	0x42: { menmonic: "JAM", rw: "-",	mode: "-",				cycle: 0}, 
	0x43: { mnemonic: "SRE", rw: "-",	mode: "(Indirect,X)",	cycle: 8},
	0x44: { mnemonic: "NOP", rw: "r",	mode: "Zeropage",		cycle: 3},
	0x45: { mnemonic: "EOR", rw: "r",	mode: "Zeropage",		cycle: 3},
	0x46: { mnemonic: "LSR", rw: "-",	mode: "Zeropage",		cycle: 5},
	0x47: { mnemonic: "SRE", rw: "-",	mode: "Zeropage",		cycle: 5},
	0x48: { mnemonic: "PHA", rw: "-",	mode: "Implied",		cycle: 3},
	0x49: { mnemonic: "EOR", rw: "r",	mode: "Immediate",		cycle: 2},
	0x4A: { mnemonic: "LSR", rw: "-",	mode: "Accumulator", 	cycle: 2},
	0x4B: { mnemonic: "ALR", rw: "-",	mode: "Immediate",	 	cycle: 2},
	0x4C: { mnemonic: "JMP", rw: "-",	mode: "Absolute",		cycle: 3},
	0x4D: { mnemonic: "EOR", rw: "r",	mode: "Absolute",		cycle: 4},
	0x4E: { mnemonic: "LSR", rw: "-",	mode: "Absolute",		cycle: 6},
	0x4F: { mnemonic: "SRE", rw: "-",	mode: "Absolute",		cycle: 6},
	0x50: { mnemonic: "BVC", rw: "-",	mode: "Relative",		cycle: 2},
	0x51: { mnemonic: "EOR", rw: "r",	mode: "(Indirect),Y",	cycle: 5},
	0x52: { menmonic: "JAM", rw: "-",	mode: "-",				cycle: 0}, 
	0x53: { mnemonic: "SRE", rw: "-",	mode: "(Indirect),Y",	cycle: 8},
	0x54: { mnemonic: "NOP", rw: "r",	mode: "Zeropage,X",		cycle: 4},
	0x55: { mnemonic: "EOR", rw: "r",	mode: "Zeropage,X",		cycle: 4},
	0x56: { mnemonic: "LSR", rw: "-",	mode: "Zeropage,X",		cycle: 6},
	0x57: { mnemonic: "SRE", rw: "-",	mode: "Zeropage,X",		cycle: 6},
	0x58: { mnemonic: "CLI", rw: "-",	mode: "Implied",		cycle: 2},
	0x59: { mnemonic: "EOR", rw: "r",	mode: "Absolute,Y",		cycle: 4},
	0x5A: { mnemonic: "NOP", rw: "r",	mode: "Implied",		cycle: 2},
	0x5B: { mnemonic: "SRE", rw: "-",	mode: "Absolute,Y",		cycle: 7},
	0x5C: { mnemonic: "NOP", rw: "r",	mode: "Absolute,X",		cycle: 4},
	0x5D: { mnemonic: "EOR", rw: "r",	mode: "Absolute,X",		cycle: 4},
	0x5E: { mnemonic: "LSR", rw: "-",	mode: "Absolute,X",		cycle: 7},
	0x5F: { mnemonic: "SRE", rw: "-",	mode: "Absolute,X",		cycle: 7},
	0x60: { mnemonic: "RTS", rw: "-",	mode: "Implied",		cycle: 6},
	0x62: { menmonic: "JAM", rw: "-",	mode: "-",				cycle: 0}, 
	0x61: { mnemonic: "ADC", rw: "r",	mode: "(Indirect,X)",	cycle: 6},
	0x63: { mnemonic: "RRA", rw: "-",	mode: "(Indirect,X)",	cycle: 8},
	0x64: { mnemonic: "NOP", rw: "r",	mode: "Zeropage",		cycle: 3},
	0x65: { mnemonic: "ADC", rw: "r",	mode: "Zeropage",		cycle: 3},
	0x66: { mnemonic: "ROR", rw: "-",	mode: "Zeropage",		cycle: 5},
	0x67: { mnemonic: "RRA", rw: "-",	mode: "Zeropage",		cycle: 5},
	0x68: { mnemonic: "PLA", rw: "-",	mode: "Implied",		cycle: 4},
	0x69: { mnemonic: "ADC", rw: "r",	mode: "Immediate",		cycle: 2},
	0x6A: { mnemonic: "ROR", rw: "-",	mode: "Accumulator", 	cycle: 2},
	0x6B: { mnemonic: "ARR", rw: "-",	mode: "Immediate",	 	cycle: 2},
	0x6C: { mnemonic: "JMP", rw: "-",	mode: "(Indirect)",		cycle: 5},
	0x6D: { mnemonic: "ADC", rw: "r",	mode: "Absolute",		cycle: 4},
	0x6E: { mnemonic: "ROR", rw: "-",	mode: "Absolute",		cycle: 6},
	0x6F: { mnemonic: "RRA", rw: "-",	mode: "Absolute",		cycle: 6},
	0x70: { mnemonic: "BVS", rw: "-",	mode: "Relative",		cycle: 2},
	0x71: { mnemonic: "ADC", rw: "r",	mode: "(Indirect),Y",	cycle: 5},
	0x72: { menmonic: "JAM", rw: "-",	mode: "-",				cycle: 0}, 
	0x73: { mnemonic: "RRA", rw: "-",	mode: "(Indirect),Y",	cycle: 8},
	0x74: { mnemonic: "NOP", rw: "r",	mode: "Zeropage,X",		cycle: 4},
	0x75: { mnemonic: "ADC", rw: "r",	mode: "Zeropage,X",		cycle: 4},
	0x76: { mnemonic: "ROR", rw: "-",	mode: "Zeropage,X",		cycle: 6},
	0x77: { mnemonic: "RRA", rw: "-",	mode: "Zeropage,X",		cycle: 6},
	0x78: { mnemonic: "SEI", rw: "-",	mode: "Implied",		cycle: 2},
	0x79: { mnemonic: "ADC", rw: "r",	mode: "Absolute,Y",		cycle: 4},
	0x7A: { mnemonic: "NOP", rw: "r",	mode: "Implied",		cycle: 2},
	0x7B: { mnemonic: "RRA", rw: "-",	mode: "Absolute,Y",		cycle: 7},
	0x7C: { mnemonic: "NOP", rw: "r",	mode: "Absolute,X",		cycle: 4},
	0x7D: { mnemonic: "ADC", rw: "r",	mode: "Absolute,X",		cycle: 4},
	0x7E: { mnemonic: "ROR", rw: "-",	mode: "Absolute,X",		cycle: 7},
	0x7F: { mnemonic: "RRA", rw: "-",	mode: "Absolute,X",		cycle: 7},
	0x80: { mnemonic: "NOP", rw: "r",	mode: "Immediate",		cycle: 2},
	0x81: { mnemonic: "STA", rw: "w",	mode: "(Indirect,X)",	cycle: 6},
	0x82: { mnemonic: "NOP", rw: "r",	mode: "Immediate",		cycle: 2},
	0x83: { mnemonic: "SAX", rw: "-",	mode: "(Indirect,X)",	cycle: 6},
	0x84: { mnemonic: "STY", rw: "w",	mode: "Zeropage",		cycle: 3},
	0x85: { mnemonic: "STA", rw: "w",	mode: "Zeropage",		cycle: 3},
	0x86: { mnemonic: "STX", rw: "w",	mode: "Zeropage",		cycle: 3},
	0x87: { mnemonic: "SAX", rw: "-",	mode: "Zeropage",		cycle: 3},
	0x88: { mnemonic: "DEY", rw: "-",	mode: "Implied",		cycle: 2},
	0x89: { mnemonic: "NOP", rw: "r",	mode: "Immediate",		cycle: 2},
	0x8A: { mnemonic: "TXA", rw: "-",	mode: "Implied",		cycle: 2},
	0x8B: { mnemonic: "ANE", rw: "-",	mode: "Immediate",	 	cycle: 2},
	0x8C: { mnemonic: "STY", rw: "w",	mode: "Absolute",		cycle: 4},
	0x8D: { mnemonic: "STA", rw: "w",	mode: "Absolute",		cycle: 4},
	0x8E: { mnemonic: "STX", rw: "w",	mode: "Absolute",		cycle: 4},
	0x8F: { mnemonic: "SAX", rw: "-",	mode: "Absolute",		cycle: 4},
	0x90: { mnemonic: "BCC", rw: "-",	mode: "Relative",		cycle: 2},
	0x91: { mnemonic: "STA", rw: "w",	mode: "(Indirect),Y",	cycle: 6},
	0x92: { menmonic: "JAM", rw: "-",	mode: "-",				cycle: 0}, 
	0x93: { mnemonic: "SHA", rw: "w",	mode: "Absolute,Y",		cycle: 5},
	0x94: { mnemonic: "STY", rw: "w",	mode: "Zeropage,X",		cycle: 4},
	0x95: { mnemonic: "STA", rw: "w",	mode: "Zeropage,X",		cycle: 4},
	0x96: { mnemonic: "STX", rw: "w",	mode: "Zeropage,Y",		cycle: 4},
	0x97: { mnemonic: "SAX", rw: "-",	mode: "Zeropage,Y",		cycle: 4},
	0x98: { mnemonic: "TYA", rw: "-",	mode: "Implied",		cycle: 2},
	0x99: { mnemonic: "STA", rw: "w",	mode: "Absolute,Y",		cycle: 5},
	0x9A: { mnemonic: "TXS", rw: "-",	mode: "Implied",		cycle: 2},
	0x9C: { mnemonic: "SHY", rw: "r",	mode: "Absolute,X",		cycle: 5},
	0x9D: { mnemonic: "STA", rw: "w",	mode: "Absolute,X",		cycle: 5},
	0x9E: { mnemonic: "SHX", rw: "r",	mode: "Absolute,Y",		cycle: 5},
	0x9F: { mnemonic: "SHA", rw: "w",	mode: "(Indirect),Y",	cycle: 6},
	0xA0: { mnemonic: "LDY", rw: "r",	mode: "Immediate",		cycle: 2},
	0xA1: { mnemonic: "LDA", rw: "r",	mode: "(Indirect,X)",	cycle: 6},
	0xA2: { mnemonic: "LDX", rw: "r",	mode: "Immediate",		cycle: 2},
	0xA3: { mnemonic: "LAX", rw: "r",	mode: "(Indirect,X)",	cycle: 6},
	0xA4: { mnemonic: "LDY", rw: "r",	mode: "Zeropage",		cycle: 3},
	0xA5: { mnemonic: "LDA", rw: "r",	mode: "Zeropage",		cycle: 3},
	0xA6: { mnemonic: "LDX", rw: "r",	mode: "Zeropage",		cycle: 3},
	0xA7: { mnemonic: "LAX", rw: "r",	mode: "Zeropage",		cycle: 3},
	0xA8: { mnemonic: "TAY", rw: "-",	mode: "Implied",		cycle: 2},
	0xA9: { mnemonic: "LDA", rw: "r",	mode: "Immediate",		cycle: 2},
	0xAA: { mnemonic: "TAX", rw: "-",	mode: "Implied",		cycle: 2},
	0xAB: { mnemonic: "LAX", rw: "-",	mode: "Immediate",	 	cycle: 2},
	0xAC: { mnemonic: "LDY", rw: "r",	mode: "Absolute",		cycle: 4},
	0xAD: { mnemonic: "LDA", rw: "r",	mode: "Absolute",		cycle: 4},
	0xAE: { mnemonic: "LDX", rw: "r",	mode: "Absolute",		cycle: 4},
	0xAF: { mnemonic: "LAX", rw: "r",	mode: "Absolute",		cycle: 4},
	0xB0: { mnemonic: "BCS", rw: "-",	mode: "Relative",		cycle: 2},
	0xB1: { mnemonic: "LDA", rw: "r",	mode: "(Indirect),Y",	cycle: 5},
	0xB2: { menmonic: "JAM", rw: "-",	mode: "-",				cycle: 0}, 
	0xB3: { mnemonic: "LAX", rw: "r",	mode: "(Indirect),Y",	cycle: 5},
	0xB4: { mnemonic: "LDY", rw: "r",	mode: "Zeropage,X",		cycle: 4},
	0xB5: { mnemonic: "LDA", rw: "r",	mode: "Zeropage,X",		cycle: 4},
	0xB6: { mnemonic: "LDX", rw: "r",	mode: "Zeropage,Y",		cycle: 4},
	0xB7: { mnemonic: "LAX", rw: "r",	mode: "Zeropage,Y",		cycle: 4},
	0xB8: { mnemonic: "CLV", rw: "-",	mode: "Implied",		cycle: 2},
	0xB9: { mnemonic: "LDA", rw: "r",	mode: "Absolute,Y",		cycle: 4},
	0xBA: { mnemonic: "TSX", rw: "-",	mode: "Implied",		cycle: 2},
	0xBB: { mnemonic: "LAS", rw: "-",	mode: "Absolute,Y",		cycle: 4},
	0xBC: { mnemonic: "LDY", rw: "r",	mode: "Absolute,X",		cycle: 4},
	0xBD: { mnemonic: "LDA", rw: "r",	mode: "Absolute,X",		cycle: 4},
	0xBE: { mnemonic: "LDX", rw: "r",	mode: "Absolute,Y",		cycle: 4},
	0xBF: { mnemonic: "LAX", rw: "r",	mode: "Absolute,Y",		cycle: 4},
	0xC0: { mnemonic: "CPY", rw: "-",	mode: "Immediate",		cycle: 2},
	0xC1: { mnemonic: "CMP", rw: "r",	mode: "(Indirect,X)",	cycle: 6},
	0xC2: { mnemonic: "NOP", rw: "r",	mode: "Immediate",		cycle: 2},
	0xC3: { mnemonic: "DCP", rw: "-",	mode: "(Indirect,X)",	cycle: 8},
	0xC4: { mnemonic: "CPY", rw: "-",	mode: "Zeropage",		cycle: 3},
	0xC5: { mnemonic: "CMP", rw: "r",	mode: "Zeropage",		cycle: 3},
	0xC6: { mnemonic: "DEC", rw: "-",	mode: "Zeropage",		cycle: 5},
	0xC7: { mnemonic: "DCP", rw: "-",	mode: "Zeropage",		cycle: 5},
	0xC8: { mnemonic: "INY", rw: "-",	mode: "Implied",		cycle: 2},
	0xC9: { mnemonic: "CMP", rw: "r",	mode: "Immediate",		cycle: 2},
	0xCA: { mnemonic: "DEX", rw: "-",	mode: "Implied",		cycle: 2},
	0xCB: { mnemonic: "SBX", rw: "-",	mode: "Immediate",	 	cycle: 2},
	0xCC: { mnemonic: "CPY", rw: "-",	mode: "Absolute",		cycle: 4},
	0xCD: { mnemonic: "CMP", rw: "r",	mode: "Absolute",		cycle: 4},
	0xCE: { mnemonic: "DEC", rw: "-",	mode: "Absolute",		cycle: 6},
	0xCF: { mnemonic: "DCP", rw: "-",	mode: "Absolute",		cycle: 6},
	0xD0: { mnemonic: "BNE", rw: "-",	mode: "Relative",		cycle: 2},
	0xD1: { mnemonic: "CMP", rw: "r",	mode: "(Indirect),Y",	cycle: 5},
	0xD2: { menmonic: "JAM", rw: "-",	mode: "-",				cycle: 0}, 
	0xD3: { mnemonic: "DCP", rw: "-",	mode: "(Indirect),Y",	cycle: 8},
	0xD4: { mnemonic: "NOP", rw: "r",	mode: "Zeropage,X",		cycle: 4},
	0xD5: { mnemonic: "CMP", rw: "r",	mode: "Zeropage,X",		cycle: 4},
	0xD6: { mnemonic: "DEC", rw: "-",	mode: "Zeropage,X",		cycle: 6},
	0xD7: { mnemonic: "DCP", rw: "-",	mode: "Zeropage,X",		cycle: 6},
	0xD8: { mnemonic: "CLD", rw: "-",	mode: "Implied",		cycle: 2},
	0xD9: { mnemonic: "CMP", rw: "r",	mode: "Absolute,Y",		cycle: 4},
	0xDA: { mnemonic: "NOP", rw: "r",	mode: "Implied",		cycle: 2},
	0xDB: { mnemonic: "DCP", rw: "-",	mode: "Absolute,Y",		cycle: 7},
	0xDC: { mnemonic: "NOP", rw: "r",	mode: "Absolute,X",		cycle: 4},
	0xDD: { mnemonic: "CMP", rw: "r",	mode: "Absolute,X",		cycle: 4},
	0xDE: { mnemonic: "DEC", rw: "-",	mode: "Absolute,X",		cycle: 7},
	0xDF: { mnemonic: "DCP", rw: "-",	mode: "Absolute,X",		cycle: 7},
	0xE0: { mnemonic: "CPX", rw: "-",	mode: "Immediate",		cycle: 2},
	0xE1: { mnemonic: "SBC", rw: "r",	mode: "(Indirect,X)",	cycle: 6},
	0xE2: { mnemonic: "NOP", rw: "r",	mode: "Immediate",		cycle: 2},
	0xE3: { mnemonic: "ISB", rw: "-",	mode: "(Indirect,X)",	cycle: 8},
	0xE4: { mnemonic: "CPX", rw: "-",	mode: "Zeropage",		cycle: 3},
	0xE5: { mnemonic: "SBC", rw: "r",	mode: "Zeropage",		cycle: 3},
	0xE6: { mnemonic: "INC", rw: "-",	mode: "Zeropage",		cycle: 5},
	0xE7: { mnemonic: "ISB", rw: "-",	mode: "Zeropage",		cycle: 5},
	0xE8: { mnemonic: "INX", rw: "-",	mode: "Implied",		cycle: 2},
	0xE9: { mnemonic: "SBC", rw: "r",	mode: "Immediate",		cycle: 2},
	0xEA: { mnemonic: "NOP", rw: "r",	mode: "Implied",		cycle: 2},
	0xEB: { mnemonic: "SBC", rw: "r",	mode: "Immediate",		cycle: 2},
	0xEC: { mnemonic: "CPX", rw: "-",	mode: "Absolute",		cycle: 4},
	0xED: { mnemonic: "SBC", rw: "r",	mode: "Absolute",		cycle: 4},
	0xEE: { mnemonic: "INC", rw: "-",	mode: "Absolute",		cycle: 6},
	0xEF: { mnemonic: "ISB", rw: "-",	mode: "Absolute",		cycle: 6},
	0xF0: { mnemonic: "BEQ", rw: "-",	mode: "Relative",		cycle: 2},
	0xF1: { mnemonic: "SBC", rw: "r",	mode: "(Indirect),Y",	cycle: 5},
	0xF2: { menmonic: "JAM", rw: "-",	mode: "-",				cycle: 0}, 
	0xF3: { mnemonic: "ISB", rw: "-",	mode: "(Indirect),Y",	cycle: 8},
	0xF4: { mnemonic: "NOP", rw: "r",	mode: "Zeropage,X",		cycle: 4},
	0xF5: { mnemonic: "SBC", rw: "r",	mode: "Zeropage,X",		cycle: 4},
	0xF6: { mnemonic: "INC", rw: "-",	mode: "Zeropage,X",		cycle: 6},
	0xF7: { mnemonic: "ISB", rw: "-",	mode: "Zeropage,X",		cycle: 6},
	0xF8: { mnemonic: "SED", rw: "-",	mode: "Implied",		cycle: 2},
	0xF9: { mnemonic: "SBC", rw: "r",	mode: "Absolute,Y",		cycle: 4},
	0xFA: { mnemonic: "NOP", rw: "r",	mode: "Implied",		cycle: 2},
	0xFB: { mnemonic: "ISB", rw: "-",	mode: "Absolute,Y",		cycle: 7},
	0xFC: { mnemonic: "NOP", rw: "r",	mode: "Absolute,X",		cycle: 4},
	0xFD: { mnemonic: "SBC", rw: "r",	mode: "Absolute,X",		cycle: 4},
	0xFE: { mnemonic: "INC", rw: "-",	mode: "Absolute,X",		cycle: 7},
	0xFF: { mnemonic: "ISB", rw: "-",	mode: "Absolute,X",		cycle: 7},
};

