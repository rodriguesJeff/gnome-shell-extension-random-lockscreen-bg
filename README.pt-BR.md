# Random Lock Screen Background

[English](README.md) · **Português**

Extensão do GNOME Shell que coloca uma imagem desfocada atrás da tela de bloqueio e pode
**trocá-la a cada desbloqueio**, usando uma imagem aleatória de uma pasta ou uma foto
aleatória do Unsplash.

É um fork da [Lock screen background](https://github.com/sunwxg/gnome-shell-extension-unlockDialogBackground),
de Xiaoguang Wang (sun.wxg). O código do fundo e do desfoque vem dessa extensão. Este fork
acrescenta as fontes de imagem.

![Fundo da tela de bloqueio desfocado](screenshot.gif)

## Recursos

| Fonte da imagem | O que faz |
|---|---|
| **Imagem única** | Sempre a mesma imagem, como na extensão original. |
| **Aleatória de uma pasta** | Escolhe uma imagem aleatória da pasta (pode incluir subpastas) e nunca repete a atual. |
| **Aleatória do Unsplash** | Baixa uma foto nova, no tamanho da sua tela. Dá para limitar a uma coleção, uma busca, um fotógrafo ou um tema. |

- A próxima imagem é preparada **logo depois que você desbloqueia**. A tela de bloqueio
  aparece na hora e funciona mesmo sem internet.
- Se algo der errado (pasta vazia, sem rede, chave inválida), a imagem anterior continua e
  o erro aparece na janela de preferências.
- O raio do desfoque e o brilho são ajustáveis. A janela de preferências mostra uma
  pré-visualização da próxima imagem e tem o botão *Pick a new picture now* (escolher outra
  imagem agora).

## Requisitos

- GNOME Shell **51**

## Instalação

```bash
git clone https://github.com/rodriguesJeff/gnome-shell-extension-unlockDialogBackground.git
cd gnome-shell-extension-unlockDialogBackground
./install.sh
```

O `install.sh` cria um link da extensão em `~/.local/share/gnome-shell/extensions/`, então
um `git pull` já a atualiza. Na primeira vez, ele também copia as configurações de desfoque
e imagem da extensão original. Se preferir uma cópia simples, use `make install`.

Depois:

1. **Encerre a sessão e entre de novo.** No Wayland, o GNOME Shell só detecta extensões
   novas quando você entra na sessão. Bloquear a tela não basta.
2. Ative esta extensão e desative a original, se você tiver (as duas entram em conflito):
   ```bash
   gnome-extensions disable unlockDialogBackground@sun.wxg@gmail.com
   gnome-extensions enable random-lockscreen-bg@jeff
   ```
3. Abra as preferências:
   ```bash
   gnome-extensions prefs random-lockscreen-bg@jeff
   ```

## Usando o Unsplash

O campo **Unsplash link or search terms** aceita:

| Entrada | Fotos de |
|---|---|
| `https://unsplash.com/collections/317099/...` | uma coleção |
| `https://unsplash.com/s/photos/night-sky` | uma busca |
| `https://unsplash.com/@usuario` | um fotógrafo |
| `https://unsplash.com/t/nature` | um tema |
| `montanhas neve` | termos de busca |
| *(vazio)* | qualquer assunto |
| qualquer outra URL de imagem, ex.: `https://picsum.photos/3840/2160` | essa URL |

O antigo serviço `source.unsplash.com` foi desativado, então o Unsplash agora exige uma
**Access Key** gratuita:

1. Acesse <https://unsplash.com/oauth/applications> e crie uma *New Application*.
2. Copie a **Access Key** (não a Secret key).
3. Cole nas preferências e aperte Enter ou ✓ para salvar.

O plano gratuito de demonstração permite 50 requisições por hora. A extensão faz uma por
desbloqueio, o que é mais que suficiente. Sem chave, ela usa fotos aleatórias do
[picsum.photos](https://picsum.photos), que também vêm do Unsplash.

As fotos baixadas ficam em `~/.cache/random-lockscreen-bg@jeff/`, e só as mais recentes são
mantidas (10 por padrão).

## Como funciona

- `extension.js` substitui a criação do fundo da tela de bloqueio (`UnlockDialog`) por uma
  versão que desenha a nossa imagem e aplica o `Shell.BlurEffect`. Ele também escuta o
  sinal `locked-changed` do `Main.screenShield` e pede uma imagem nova a cada desbloqueio.
- `imageProvider.js` escolhe a próxima imagem conforme a fonte selecionada. Todo acesso a
  disco e rede é assíncrono, então o Shell nunca trava. Quando tem uma imagem nova, ele
  grava o caminho na configuração `picture-uri`.
- `backgroundNew.js` observa a `picture-uri` e recarrega o fundo.
- `prefs.js` é a janela de preferências, em GTK4 e libadwaita. Ela só lê e grava o
  GSettings, que é o canal de comunicação com a extensão que roda dentro do Shell.

Todas as configurações ficam em `/org/gnome/shell/extensions/random-lockscreen-bg/`:

```bash
dconf dump /org/gnome/shell/extensions/random-lockscreen-bg/
```

## Solução de problemas

- **"A extensão não existe" logo após instalar**: encerre a sessão e entre de novo.
- **A imagem não troca**: veja a linha *Last error* nas preferências ou acompanhe os logs:
  ```bash
  journalctl -f -o cat /usr/bin/gnome-shell | grep random-lockscreen
  ```

## Desinstalar

```bash
gnome-extensions disable random-lockscreen-bg@jeff
rm ~/.local/share/gnome-shell/extensions/random-lockscreen-bg@jeff
dconf reset -f /org/gnome/shell/extensions/random-lockscreen-bg/
rm -rf ~/.cache/random-lockscreen-bg@jeff
```

## Créditos e licença

- Extensão original: [sunwxg/gnome-shell-extension-unlockDialogBackground](https://github.com/sunwxg/gnome-shell-extension-unlockDialogBackground),
  © 2018 Xiaoguang Wang.
- Fontes de imagem aleatória: Jefferson Souza.
- Fotos: [Unsplash](https://unsplash.com) e [Lorem Picsum](https://picsum.photos).

Distribuída sob a [Licença MIT](LICENSE), assim como a original.
