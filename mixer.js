
class Mixer extends AudioWorkletProcessor {	
	constructor() {
		super();

		this.port.onmessage = (e) => {
			this.buffer = this.buffer.concat(e.data);
		}

		this.buffer = [0];
	}

	process(inputs, outputs, parameters) {
		const output = outputs[0];
		for (let channel = 0; channel < output.length; ++channel) {
			for (let i = 0, len = output[channel].length; i < len; i++) {
				if (this.buffer.length > 1) {
					output[channel][i] = this.buffer.shift();
				}
				else {
					output[channel][i] = this.buffer.at(-1);
				}
			}
		}
		return true;
	}
}

registerProcessor("mixer", Mixer);
