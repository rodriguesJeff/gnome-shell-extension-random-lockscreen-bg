UUID = random-lockscreen-bg@jeff

schemas:
	glib-compile-schemas $(UUID)/schemas/

submit:
	cd $(UUID)/ && zip -r ~/$(UUID).zip * -x schemas/gschemas.compiled

install: schemas
	mkdir -p ~/.local/share/gnome-shell/extensions
	rm -rf ~/.local/share/gnome-shell/extensions/$(UUID)
	cp -r $(UUID) ~/.local/share/gnome-shell/extensions/
