import {NES} from "./module/nes.js"

const nes = new NES();

const romFileInput = document.querySelector("input[id='rom']")
romFileInput.addEventListener("change", () => {
	const file = romFileInput.files[0];
	if (file) {
		const reader = new FileReader();
		reader.addEventListener("load", () => {
			nes.load(reader.result);
		});
		reader.readAsArrayBuffer(file);
	}
});

document.querySelector("input[id='run']")
.addEventListener("click", function() {
	nes.run();
});

document.querySelector("input[id='stop']")
.addEventListener("click", function() {
	nes.stop();
});

document.querySelector("input[id='reset']")
.addEventListener("click", function() {
	nes.reset();
});

