const modal = document.querySelector('#task-modal');

document.querySelectorAll('[data-open-modal]').forEach((button) => {
    button.addEventListener('click', () => {
        modal?.showModal();
        window.setTimeout(() => modal?.querySelector('input[name="content"]')?.focus(), 50);
    });
});

document.querySelectorAll('[data-close-modal]').forEach((button) => {
    button.addEventListener('click', () => modal?.close());
});

modal?.addEventListener('click', (event) => {
    if (event.target === modal) modal.close();
});
