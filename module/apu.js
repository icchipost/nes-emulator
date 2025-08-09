
export function APU() {
	this.registers = new Array(32);

	//$4017
	this.sequencerMode = 0;
	this.interruptInhabitFlag = 0;

	//割り込み
	this.frameInterruptFlag = 0;

	//this.cycle = 0;
	this.apuCycle = 0;
	this.apuCycleOdd = 1;

	this.quaterFrameTrigger = 0;
	this.halfFrameTrigger = 0;

	this.pulse1 = new Pulse(1);
	this.pulse2 = new Pulse(2);
	this.triangle = new Triangle();
	this.noise = new Noise();
	this.dmc = new DMC();
	
	this.cpu;
	
	//cpuからapuレジスタ書き込みバッファ
	//書き込みがあったサイクルの書き込みアドレスを一時保存
	//lengthCounterHaltの書き込み遅延に使用
	this.tempWriteRegistersAddress = 0;
	
	this.powerup = async function(cpu) {
		this.registers.fill(0);
		this.apuCycle = 0;
		this.cpu = cpu;

		//console.log(audioContext.state);
		if (audioContext.state === "suspended") {
			audioContext.resume(); 
		}
	}
	
	this.reset = function() {
		this.writeRegisters(0x4015, 0);
	}
	
	this.writeRegisters = function(address, data) {
		this.registers[address - 0x4000] = data;
		this.tempWriteRegistersAddress = address;
	}

	this.writeRegistersDelay = function(address, data) {
		if (0x4000 <= address && address <= 0x4003) {
			//pulse1
			this.pulse1.writeRegisters(address, data);
		}
		else if (0x4004 <= address && address <= 0x4007) {
			//pulse2
			this.pulse2.writeRegisters(address, data);
		}
		else if (0x4008 <= address && address <= 0x400B) {
			//triangle
			this.triangle.writeRegisters(address, data);
		}
		else if (0x400C <= address && address <= 0x400F) {
			//noise
			this.noise.writeRegisters(address, data);
		}
		else if (0x4010 <= address && address <= 0x4013) {
			//dmc
			this.dmc.writeRegisters(address, data);
		}
		else if (address === 0x4015) {
			//status
			this.pulse1.writeRegisters(address, data & 1);
			this.pulse2.writeRegisters(address, (data >> 1) & 1);
			this.triangle.writeRegisters(address, (data >> 2) & 1);
			this.noise.writeRegisters(address, (data >> 3) & 1);
			this.dmc.writeRegisters(address, (data >> 4) & 1);

			this.cpu.assertIRQ(0);
			this.frameInterruptFlag = 0;

			//console.log("write $4015:", data.toString(2).padStart(8, 0));
		}
		else if (address === 0x4017) {
			//frameCounter
			
			//apuサイクルのジッター処理
			//https://www.nesdev.org/wiki/APU_Frame_Counter
			if (this.apuCycleOdd) {
				//this.cpuCycleOddは次フレームの偶奇を示すので、
				//書き込む時点での偶奇が反転することに注意

				//奇(書き込み)→偶→奇(反映)
				this.jitterCycle = 2;
			}
			else {
				//偶(書き込み)→奇→偶→奇(反映)
				this.jitterCycle = 3;
			}
		}
	}

	this.jitterCycle = 0;

	this.readRegisters = function(address) {
		if (address === 0x4015) {
			let res = 0;

			//各チャネルのlengthCounterValueが1以上ならセット
			res |= (this.pulse1.readRegisters(address));
			res |= (this.pulse2.readRegisters(address) << 1);
			res |= (this.triangle.readRegisters(address) << 2);
			res |= (this.noise.readRegisters(address) << 3);
			res |= (this.dmc.readRegisters(address));
			res |= (this.frameInterruptFlag << 6);

			//割り込みクリア
			this.cpu.assertIRQ(0);
			this.frameInterruptFlag = 0;

			//console.log("read $4015:", res.toString(2).padStart(8, 0));

			return res;
		}

		return this.registers[address - 0x4000];
	}



	this.run = function(cpuCycle) {

		if (this.quaterFrameTrigger) {
			this.pulse1.envelope();
			this.pulse2.envelope();
			this.triangle.linearCounter();
			this.noise.envelope();

			this.quaterFrameTrigger = 0;
		}

		if (this.halfFrameTrigger) {
			this.pulse1.sweep();
			this.pulse1.lengthCounter();

			this.pulse2.sweep();
			this.pulse2.lengthCounter();

			this.triangle.lengthCounter();
			this.noise.lengthCounter();
			this.halfFrameTrigger = 0;
		}
		
		if (this.jitterCycle) {
			this.jitterCycle--;
			if (this.jitterCycle <= 0) {
				const data = this.registers[0x17];
				this.sequencerMode = (data >> 7) & 1;
				this.interruptInhibitFlag = (data >> 6) & 1;
				this.apuCycle = 0;

				if (this.interruptInhibitFlag) {
					//割り込みクリア
					this.cpu.assertIRQ(0);
					this.frameInterruptFlag = 0;
				}

				//timerをリセット
				;

				if (this.sequencerMode === 1) {
					//1/4,1/2フレームを発行
					this.quaterFrameTrigger = 1;
					this.halfFrameTrigger = 1;
				}
			}
		}
		
		if (this.apuCycleOdd) {
			this.pulse1.timer();
			this.pulse2.timer();
			this.noise.timer();
		}
		
		this.triangle.timer();
		this.dmc.timer();
		if (this.dmc.assertDMAFlag) {
			const address = this.dmc.getSmapleAddress();
			this.cpu.assertDMCDMA(address);
			this.dmc.assertDMAFlag = 0;
		}
		if (this.dmc.assertIRQFlag) {
			this.cpu.assertIRQ(1);
		}
		//const [assertIRQFlag, assertDMAFlag] = this.dmc.timer();
		
		this.frameCounter(cpuCycle);
		

		if (this.tempWriteRegistersAddress) {
			this.writeRegistersDelay(
				this.tempWriteRegistersAddress,
				this.registers[this.tempWriteRegistersAddress - 0x4000]
			);
			this.tempWriteRegistersAddress = 0;
		}
		
		if (!this.apuCycleOdd) {
			this.apuCycle++;
		}

		this.apuCycleOdd ^= 1;
		
		if (cpuCycle === 0) {
			this.c = 0;
		}

		const dt = 5.59647e-7;
		this.t += dt;
		if (this.t > 1/44100) {
			this.t -= 2.26757e-5;
			this.c++;

			let p1 = this.pulse1.sample();
			let p2 = this.pulse2.sample();
			let t = this.triangle.sample();
			let n = this.noise.sample();
			let d = this.dmc.sample();

			//p1 = p2 = t = n = 0;

			//const pulseOut = 95.88 / (8128 / (p1 + p2) + 100);
			//const tndOut = 159.75 / (1 / ((t / 8227) + (n / 12241) + (d / 22638)) + 100);
			const pulseOut = 0.00752 * (p1 + p2);
			const tndOut = 0.00851 * t + 0.00494 * n + 0.00335 * d;
			const out = pulseOut + tndOut;
			push(out);
		}
	}
	this.t = 0;
	this.c = 0;

	this.frameCounter = function(cpuCycle) {
		//const step = Math.floor(this.apuCycle / 894887 / 240);

		if (this.sequencerMode === 0){
			//4ステップ
			if (this.apuCycle === 3728) {
				if (this.apuCycleOdd) {
					//3728.5
					this.quaterFrameTrigger = 1;
				}
			}
			else if (this.apuCycle === 7456) {
				if (this.apuCycleOdd) {
					//7456.5
					this.quaterFrameTrigger = 1;
					this.halfFrameTrigger = 1;
				}
			}
			else if (this.apuCycle === 11185) {
				if (this.apuCycleOdd) {
					//11185.5
					this.quaterFrameTrigger = 1;
				}
			}
			else {
				if (this.apuCycle === 14914) {
					if (this.apuCycleOdd) {
						//14914.5
						this.quaterFrameTrigger = 1;
						this.halfFrameTrigger = 1;
					}

					if (!this.interruptInhibitFlag) {
						//IRQ割り込みアサート
						this.cpu.assertIRQ(1);
						this.frameInterruptFlag = 1;
					}
				}
				else if (this.apuCycle === 14915) {
					this.apuCycle = 0;

					if (!this.interruptInhibitFlag) {
						//IRQ割り込みアサート
						this.cpu.assertIRQ(1);
						this.frameInterruptFlag = 1;
					}
				}
			}
		}
		else {
			//5ステップ
			if (this.apuCycle === 3728) {
				if (this.apuCycleOdd) {
					//3728.5
					this.quaterFrameTrigger = 1;
				}
			}
			else if (this.apuCycle === 7456) {
				if (this.apuCycleOdd) {
					//7456.5
					this.quaterFrameTrigger = 1;
					this.halfFrameTrigger = 1;
				}
			}
			else if (this.apuCycle === 11185) {
				if (this.apuCycleOdd) {
					//11185.5
					this.quaterFrameTrigger = 1;
				}
			}
			else if (this.apuCycle === 14914) {
				if (this.apuCycleOdd) {
					//14914.5
				}
			}
			else if (this.apuCycle === 18640) {
				if (this.apuCycleOdd) {
					//18640.5
					this.quaterFrameTrigger = 1;
					this.halfFrameTrigger = 1;
				}
			}
			else if (this.apuCycle === 18641) {
				this.apuCycle = 0;
			}
		}
	}

	// this.getApuCycle = function() {
	// 	return this.apuCycle;
	// }
}

//実際に読み込まれる値＋１した値を格納
const lengthCounterTable = [
	10, 254, 20, 2, 40, 4, 80, 6, 160, 8, 60, 10, 14, 12, 26, 14,
	12, 16, 24, 18, 48, 20, 96, 22, 192, 24, 72, 26, 16, 28, 32, 30
];

function Pulse(channelNo) {
	//0 or 1
	this.channelNo = channelNo;

	//$4000/$4004
	this.dutyCycle = 0;
	this.lengthCounterHalt = 0;
	this.constantVolumeFlag = 0;
	this.volume = 0;
	
	//$4001/$4005
	this.sweepEnable = 0;
	this.sweepPeriod = 0;
	this.sweepNegate = 0;
	this.sweepShift = 0;

	//$4002/$4006
	this.timerLow = 0;

	//$4003/$4007
	this.timerHigh = 0;
	this.lengthCouterLoad = 0;

	//$4015
	this.lengthCounterEnableFlag = 0;

	this.writeRegisters = function(address, data) {
		if (address === 0x4000 || address === 0x4004) {
			this.dutyCycle = (data >> 6) & 0x03;
			this.lengthCounterHalt = (data >> 5) & 0x01;
			this.constantVolumeFlag = (data >> 4) & 0x01;
			this.volume = data & 0x0F;
		}
		else if (address === 0x4001 || address === 0x4005) {
			this.sweepEnable = (data >> 7) & 0x01;
			this.sweepPeriod = (data >> 4) & 0x07;
			this.sweepNegate = (data >> 3) & 0x01;
			this.sweepShift = data & 0x07;

			this.sweepReload = 1;
		}
		else if (address === 0x4002 || address === 0x4006) {
			this.timerLow = data & 0xFF;
		}
		else if (address === 0x4003 || address === 0x4007) {
			this.lengthCounterLoad = (data >> 3) & 0x1F;
			this.timerHigh = data & 0x07;	
			
			if (this.lengthCounterEnableFlag) {
				this.lengthCounterValue = lengthCounterTable[this.lengthCounterLoad];
			}

			//envelopeをリセット
			this.startFlag = 1;
		}
		else if (address === 0x4015) {
			this.lengthCounterEnableFlag = data;
			if (!this.lengthCounterEnableFlag) {
				this.lengthCounterValue = 0;
			}
		}
	}

	this.readRegisters = function(address) {
		if (address === 0x4015) {
			return (this.lengthCounterValue > 0);
		}
	}

	this.startFlag = 0;
	this.envelopeDivider = 0;
	this.decayLevel = 0;
	this.envelope = function() {
		if (this.startFlag) {
			this.startFlag = 0;			
			this.envelopeDivider = this.volume;
			this.decayLevel = 15;
		}
		else {
			if (this.envelopeDivider > 0) {
				this.envelopeDivider--;
			}
			else {
				this.envelopeDivider = this.volume;
				if (this.decayLevel > 0) {
					this.decayLevel--;
				}
				else {
					if (this.lengthCounterHalt) {
						this.decayLevel = 15;
					}
				}
			}
		}
	}

	this.sweepDivider = 0
	this.sweepMuting = 0;
	this.sweepReload = 0;
	this.sweep = function() {
		//分周器を更新
		if (this.sweepDivider === 0 && this.sweepEnable && this.sweepShift) {
			let t  = (this.timerHigh << 8) | this.timerLow;
			let td = t >> this.sweepShift;
			if (this.sweepNegate) {
				if (this.channelNo === 1) td = -td - 1;
				if (this.channelNo === 2) td = -td;
			}
			t += td;
			if (t < 0) t = 0;

			//ミュート
			if (t < 8 || 0x7FF < t) this.sweepMuting = 1;
			else this.sweepMuting = 0;

			if (!this.sweepMuting) {
				//周期を変更
				this.timerHigh = (t >> 8) & 0x07;
				this.timerLow = t & 0x0FF;
			}
		}

		if (this.sweepDivider === 0 || this.sweepReload) {
			this.sweepDivider = this.sweepPeriod;
			this.sweepReload = 0;
		}
		else {
			this.sweepDivider--;
		}
	}

	this.timerValue = 0;
	this.timer = function() {
		if (this.timerValue > 0) {
			this.timerValue--;
		}
		else {
			this.timerValue = (this.timerHigh << 8) | this.timerLow;
			this.sequencer();
		}
	}

	this.sequencerStep = 0;
	this.sequencerTable = [
		[0, 0, 0, 0, 0, 0, 0, 1],
		[0, 0, 0, 0, 0, 0, 1, 1],
		[0, 0, 0, 0, 1, 1, 1, 1],
		[1, 1, 1, 1, 1, 1, 0, 0]
	];
	this.sequencer = function() {
		if (this.sequencerStep === 0) {
			this.sequencerStep = 7;
		}
		else {
			this.sequencerStep--;
		}
	}

	this.lengthCounterValue = 0;
	this.lengthCounter = function() {
		if (this.lengthCounterEnableFlag) {
			if (!this.lengthCounterHalt && this.lengthCounterValue > 0) {
				this.lengthCounterValue--;
			}
		}
		else {
			this.lengthCounterValue = 0;
		}
	}

	this.sample = function() {
		let res = this.decayLevel;
		if (this.constantVolumeFlag) res = this.volume;
		if (this.sweepMuting) res = 0;
		if (this.sequencerTable[this.dutyCycle][this.sequencerStep] === 0) res = 0;
		if (this.lengthCounterValue === 0) res = 0;

		return res;
	}
}

function Triangle() {
	//$4008
	this.lengthCounterHalt = 0;
	this.linearCounterLoad = 0;

	//$4009(unused)

	//$400A
	this.timerLow = 0;

	//$400B
	this.lengthCounterLoad = 0;
	this.timerHigh = 0;

	//$4015
	this.lengthCounterEnableFlag = 0;

	this.writeRegisters = function(address, data) {
		if (address === 0x4008) {
			this.lengthCounterHalt = (data >> 7) & 0x01;
			this.linearCounterLoad = data & 0x7F;
		}
		else if (address === 0x400A) {
			this.timerLow = data & 0xFF;
		}
		else if (address === 0x400B) {
			this.lengthCounterLoad = (data >> 3) & 0x1F;
			this.timerHigh = data & 0x07;
			
			if (this.lengthCounterEnableFlag) {
				this.lengthCounterValue = lengthCounterTable[this.lengthCounterLoad];
			}

			this.linearCounterReloadFlag = 1;
		}
		else if (address === 0x4015) {
			this.lengthCounterEnableFlag = data;
			if (!this.lengthCounterEnableFlag) {
				this.lengthCounterValue = 0;
			}
		}
	}

	this.readRegisters = function(address) {
		if (address === 0x4015) {
			return (this.lengthCounterValue > 0);
		}
	}

	this.timerValue = 0;
	this.timer = function() {
		if (this.timerValue > 0) {
			this.timerValue--;
		}
		else {
			this.timerValue = (this.timerHigh << 8) | this.timerLow;
			this.sequencer();
		}
	}

	this.linearCounterValue = 0;
	this.linearCounterReloadFlag = 0;
	this.linearCounter = function() {
		if (this.linearCounterReloadFlag) {
			this.linearCounterValue = this.linearCounterLoad;
		}
		else if (this.linearCounterValue > 0) {
			this.linearCounterValue--;
		}

		if (!this.lengthCounterHalt) {
			this.linearCounterReloadFlag = 0;
		}
	}

	this.lengthCounterValue = 0;
	this.lengthCounter = function() {
		if (this.lengthCounterEnableFlag) {
			if (!this.lengthCounterHalt && this.lengthCounterValue > 0) {
				this.lengthCounterValue--;
			}
		}
		else {
			this.lengthCounterValue = 0;
		}
	}

	this.sequencerStep = 0;
	this.sequencerTable = [
		15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0,
		0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15
	];
	this.sequencer = function() {
		if (this.linearCounterValue && this.lengthCounterValue) {
			this.sequencerStep++;
			if (this.sequencerStep === 32) {
				this.sequencerStep = 0;
			}
		}
	}

	this.sample = function() {
		let res = this.sequencerTable[this.sequencerStep];
		if (this.lengthCounterValue === 0) res = 0;
		return res;
	}
}

function Noise() {
	//$400C
	this.lengthCounterHalt = 0;
	this.constantVolumeFlag = 0;
	this.volume = 0;

	//$400E
	this.modeFlag = 0;
	this.timerPeriod = 0;

	//$400F
	this.lengthCounterLoad = 0;

	//$4015
	this.lengthCounterEnableFlag = 0;
	
	//エンベロープ用変数
	this.startFlag = 0;
	this.envelopeDivider = 0;
	this.decayLevel = 0;

	//タイマー用変数
	this.timerValue = 0;

	//タイマー用周期テーブル(cpuサイクルベース)
	this.timerPeriodTable = [
		4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380,508, 762, 1016, 2034, 4068
	];

	//乱数生成用シフトレジスタ
	this.shiftRegister = 1;

	//長さカウンター用変数
	this.lengthCounterValue = 0;

	this.writeRegisters = function(address, data) {
		if (address === 0x400C) {
			this.lengthCounterHalt = (data >> 5) & 1;
			this.constantVolumeFlag = (data >> 4) & 1;
			this.volume = data & 0x0F;
		}
		else if (address === 0x400E) {
			this.modeFlag = (data >> 7) & 1;
			this.timerPeriod = data & 0x0F;
		}
		else if (address === 0x400F) {
			this.lengthCounterLoad = (data >> 3) & 0x1F;
			if (this.lengthCounterEnableFlag) {
				this.lengthCounterValue = lengthCounterTable[this.lengthCounterLoad];
			}
			this.startFlag = 1;
		}
		else if (address === 0x4015) {
			this.lengthCounterEnableFlag = data;
			if (!this.lengthCounterEnableFlag) {
				this.lengthCounterValue = 0;
			}
		}
	}

	this.readRegisters = function(address) {
		if (address === 0x4015) {
			return (this.lengthCounterValue > 0);
		}
	}
	
	this.envelope = function() {
		if (this.startFlag) {
			this.startFlag = 0;
			this.envelopeDivider = this.volume;
			this.decayLevel = 15;
		}
		else {
			if (this.envelopeDivider > 0){
				this.envelopeDivider--;
			}
			else {
				this.envelopeDivider = this.volume;
				if (this.decayLevel > 0) {
					this.decayLevel--;
				}
				else {
					if (this.lengthCounterHalt) {
						this.decayLevel = 15;
					}
				}
			}
		}
	}
	
	this.timer = function() {
		if (this.timerValue > 0) {
			this.timerValue -= 2;
		}
		else {
			this.timerValue = this.timerPeriodTable[this.timerPeriod];
			this.pseudoRandomNumberGenerator();
		}
	}	
	
	this.pseudoRandomNumberGenerator = function() {
		let feedback = this.shiftRegister & 1;
		if (this.modeFlag === 0) {
			feedback ^= (this.shiftRegister >> 1) & 1;
		}
		else {
			feedback ^= (this.shiftRegister >> 6) & 1;
		}
		this.shiftRegister >>= 1;
		this.shiftRegister |= (feedback << 14);
	}

	this.lengthCounter = function() {
		if (this.lengthCounterEnableFlag) {
			if (!this.lengthCounterHalt && this.lengthCounterValue > 0) {
				this.lengthCounterValue--;
			}
		}
		else {
			this.lengthCounterValue = 0;
		}
	}

	this.sample = function() {
		let res = this.decayLevel;
		if (this.constantVolumeFlag) res = this.volume;
		if ((this.shiftRegister & 1) === 0) res = 0;
		if (this.lengthCounterValue === 0) res = 0;

		//console.log(res, this.decayLevel, this.constantVolumeFlag, (this.shiftRegister & 1), this.lengthCounterValue);
		return res;
	}
}

function DMC() {
	////////// レジスタ //////////
	//$4010
	this.irqEnabledFlag = 0;
	this.loopFlag = 0;
	this.rateIndex = 0;

	//$4011
	this.directLoad = 0;

	//$4012
	this.sampleAddress = 0;

	//$4013
	this.sampleLength = 0;

	//$4015
	this.enableDMC = 0;

	this.pitchTable = [
		428, 380, 340, 320, 286, 254, 226, 214,
		190, 160, 142, 128, 106,  84,  72,  54
	];

	this.writeRegisters = function(address, data) {
		if (address === 0x4010) {
			this.irqEnabledFlag = (data >> 7) & 1;
			this.loopFlag = (data >> 6) & 1;
			this.rateIndex = data & 0x0F;
			//this.timerValue = this.pitchTable[this.rateIndex];

			if (!this.irqEnabledFlag) {
				this.assertIRQFlag = 0
			}
		}
		else if (address === 0x4011) {
			this.directLoad = data & 0x7F;
			this.outputLevel = this.directLoad;
		}
		else if (address === 0x4012) {
			this.sampleAddress = data & 0xFF;
		}
		else if (address === 0x4013) {
			this.sampleLength = data & 0xFF;
		}
		else if (address === 0x4015) {
			this.enableDMC = data;
			this.assertIRQFlag = 0;

			if (this.enableDMC) {
				if (this.currentSampleLength === 0) {
					this.currentSampleAddress = this.sampleAddress * 64 + 0xC000;
					this.currentSampleLength = this.sampleLength * 16 + 1;
					
					//メモリリーダー
					//if (this.sampleBuffer === -1 && this.currentSampleLength > 0) {
					if (this.sampleBuffer.length === 0 && this.currentSampleLength > 0) {
						//console.log("apu -> cpu assert DMC DMA");
						this.assertDMAFlag = 1;
						
						if (this.currentSampleAddress === 0xFFFF) {
							this.currentSampleAddress = 0x8000;
						}
						else {
							this.currentSampleAddress++;
						}

						this.currentSampleLength--;
						if (this.currentSampleLength === 0) {
							if (this.loopFlag) {
								this.currentSampleAddress = this.sampleAddress * 64 + 0xC000;
								this.currentSampleLength = this.sampleLength * 16 + 1;
							}
							else {
								if (this.irqEnabledFlag) {
									//console.log("assert DMC IRQ");
									this.assertIRQFlag = 1;
								}
							}
						}
					}
				}
			}
			else {
				this.currentSampleLength = 0;
			}
		}

		//let log = "write " + address.toString(16).padStart(4, 0);
		//log += " = " + data.toString(2).padStart(8, 0);
		//console.log(log);
	}

	this.readRegisters = function(address) {
		if (address === 0x4015) {
			let res = 0;
			if (this.currentSampleLength > 0) res |= (1 << 4);
			if (this.assertIRQFlag) res |= (1 << 7);

			//let log = "read " + address.toString(16).padStart(4, 0);
			//log += " = " + res.toString(2).padStart(8, 0);
			//console.log(log, this.currentSampleLength, this.timerValue);

			return res;
		}
	}

	//DMC DMA用
	this.getSmapleAddress = function() {
		return this.currentSampleAddress;
	}
	this.setSampleBuffer = function(data) {
		this.sampleBuffer.push(data);
	}

	///// output unit /////
	this.timerValue = 0;
	//this.sampleBuffer = -1;			//空の場合-1
	this.sampleBuffer = [];
	this.shiftRegister = 0;
	this.remainingBitsCounter = 0;
	this.outputLevel = 0;
	this.silenceFlag = 0;

	///// reader /////
	this.currentSampleAddress = 0;
	this.currentSampleLength = 0;

	this.assertIRQFlag = 0;
	this.assertDMAFlag = 0;

	this.timer = function() {
		if (this.timerValue === 0) {
			if (this.remainingBitsCounter === 0) {
				//console.log("出力サイクル開始", this.pitchTable[this.rateIndex]);

				this.remainingBitsCounter = 8;
				// if (this.sampleBuffer != -1) {
				// 	this.silenceFlag = 0;
				// 	this.shiftRegister = this.sampleBuffer;
				// 	this.sampleBuffer = -1;
				// }
				if (this.sampleBuffer.length) {
					this.silenceFlag = 0;
					this.shiftRegister = this.sampleBuffer.pop();
				}
				else {
					//バッファが空
					this.silenceFlag = 1;
				}
			}

			//メモリリーダー
			//if (this.sampleBuffer === -1 && this.currentSampleLength > 0) {
			if (this.sampleBuffer.length === 0 && this.currentSampleLength > 0) {
				//console.log("apu -> cpu assert DMC DMA");
				this.assertDMAFlag = 1;
				
				if (this.currentSampleAddress === 0xFFFF) {
					this.currentSampleAddress = 0x8000;
				}
				else {
					this.currentSampleAddress++;
				}

				this.currentSampleLength--;
				if (this.currentSampleLength === 0) {
					if (this.loopFlag) {
						this.currentSampleAddress = this.sampleAddress * 64 + 0xC000;
						this.currentSampleLength = this.sampleLength * 16 + 1;
					}
					else {
						if (this.irqEnabledFlag) {
							//console.log("assert DMC IRQ");
							this.assertIRQFlag = 1;
						}
					}
				}
			}

			if (!this.silenceFlag) {
				if (this.shiftRegister & 1) {
					if (this.outputLevel + 2 <= 127) {
						this.outputLevel += 2;
					}
				}
				else {
					if (this.outputLevel - 2 >= 0) {
						this.outputLevel -= 2;
					}
				}
			}

			this.shiftRegister >>= 1;
			this.remainingBitsCounter--;
			this.timerValue = this.pitchTable[this.rateIndex];
		}

		this.timerValue--;
	}

	this.sample = function() {
		return this.outputLevel;
	}
}

const audioContext = new AudioContext({sampleRate: 44100});
await audioContext.audioWorklet.addModule("mixer.js");
const mixer = new AudioWorkletNode(audioContext, "mixer");
mixer.connect(audioContext.destination);

//const output = mixer.parameters.get("output");

const buf = [];

function push(data) {
	buf.push(data);
	
	if (buf.length === 128) {
		mixer.port.postMessage(buf);
		buf.length = 0;
	}
}
