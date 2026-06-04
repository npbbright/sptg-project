function toggleSidebar() {
    document.body.classList.toggle("sidebar-open");
}

function closeSidebar() {
    document.body.classList.remove("sidebar-open");
}

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        closeSidebar();
    }
});
