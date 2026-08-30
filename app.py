from calendar import monthrange
from datetime import date, datetime, timedelta
from pathlib import Path

from flask import Flask, abort, redirect, render_template, request, url_for
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import inspect, text

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///test.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db = SQLAlchemy(app)


class Todo(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.String(200), nullable=False)
    course = db.Column(db.String(80), nullable=False, default="General")
    item_type = db.Column(db.String(20), nullable=False, default="assignment")
    priority = db.Column(db.String(10), nullable=False, default="medium")
    due_date = db.Column(db.Date)
    due_time = db.Column(db.Time)
    notes = db.Column(db.Text, nullable=False, default="")
    recurrence = db.Column(db.String(20), nullable=False, default="none")
    completed = db.Column(db.Boolean, nullable=False, default=False)
    completed_at = db.Column(db.DateTime)
    date_created = db.Column(db.DateTime, default=datetime.utcnow)

    @property
    def due_state(self):
        if self.completed or not self.due_date:
            return ""
        days = (self.due_date - date.today()).days
        if days < 0:
            return "overdue"
        if days == 0:
            return "today"
        return "soon" if days <= 3 else "later"

    @property
    def due_label(self):
        if not self.due_date:
            return "No due date"
        days = (self.due_date - date.today()).days
        if days == 0:
            label = "Today"
        elif days == 1:
            label = "Tomorrow"
        elif days == -1:
            label = "Yesterday"
        elif days < 0:
            label = f"{abs(days)} days overdue"
        else:
            label = self.due_date.strftime("%b %-d")
        if self.due_time:
            label += f" · {self.due_time.strftime('%-I:%M %p')}"
        return label


def parse_date(value):
    return datetime.strptime(value, "%Y-%m-%d").date() if value else None


def parse_time(value):
    return datetime.strptime(value, "%H:%M").time() if value else None


def next_due_date(current, recurrence):
    if not current:
        return None
    if recurrence == "daily":
        return current + timedelta(days=1)
    if recurrence == "weekly":
        return current + timedelta(weeks=1)
    if recurrence == "biweekly":
        return current + timedelta(weeks=2)
    if recurrence == "monthly":
        month = current.month + 1
        year = current.year + (month > 12)
        month = 1 if month > 12 else month
        return date(year, month, min(current.day, monthrange(year, month)[1]))
    return current


def apply_form(task):
    task.content = request.form.get("content", "").strip()
    if not task.content:
        abort(400, "Title is required")
    task.course = request.form.get("course", "").strip() or "General"
    task.item_type = request.form.get("item_type", "assignment")
    task.priority = request.form.get("priority", "medium")
    task.due_date = parse_date(request.form.get("due_date"))
    task.due_time = parse_time(request.form.get("due_time"))
    task.notes = request.form.get("notes", "").strip()
    task.recurrence = request.form.get("recurrence", "none")


@app.route("/", methods=["GET", "POST"])
def index():
    if request.method == "POST":
        task = Todo()
        apply_form(task)
        db.session.add(task)
        db.session.commit()
        return redirect(url_for("index"))

    query = Todo.query
    search = request.args.get("search", "").strip()
    status = request.args.get("status", "open")
    item_type = request.args.get("type", "all")
    course = request.args.get("course", "all")
    if search:
        like = f"%{search}%"
        query = query.filter(db.or_(Todo.content.ilike(like), Todo.course.ilike(like)))
    if status == "open":
        query = query.filter_by(completed=False)
    elif status == "completed":
        query = query.filter_by(completed=True)
    if item_type == "assessment":
        query = query.filter(Todo.item_type.in_(["exam", "quiz"]))
    elif item_type != "all":
        query = query.filter_by(item_type=item_type)
    if course != "all":
        query = query.filter_by(course=course)

    tasks = query.order_by(Todo.completed.asc(), Todo.due_date.is_(None), Todo.due_date.asc(), Todo.due_time.asc(), Todo.date_created.desc()).all()
    all_tasks = Todo.query.all()
    courses = sorted({task.course for task in all_tasks if task.course})
    today = date.today()
    stats = {
        "open": sum(not task.completed for task in all_tasks),
        "due_today": sum(not task.completed and task.due_date == today for task in all_tasks),
        "upcoming": sum(bool(not task.completed and task.due_date and today < task.due_date <= today + timedelta(days=7)) for task in all_tasks),
        "completed": sum(task.completed for task in all_tasks),
    }
    return render_template("index.html", tasks=tasks, courses=courses, stats=stats, filters={"search": search, "status": status, "type": item_type, "course": course})


@app.post("/toggle/<int:task_id>")
def toggle(task_id):
    task = db.session.get(Todo, task_id) or abort(404)
    task.completed = not task.completed
    task.completed_at = datetime.utcnow() if task.completed else None
    if task.completed and task.recurrence != "none":
        next_date = next_due_date(task.due_date, task.recurrence)
        already_created = Todo.query.filter_by(
            content=task.content, course=task.course, due_date=next_date,
            recurrence=task.recurrence, completed=False,
        ).first()
        if not already_created:
            db.session.add(Todo(content=task.content, course=task.course, item_type=task.item_type, priority=task.priority, due_date=next_date, due_time=task.due_time, notes=task.notes, recurrence=task.recurrence))
    db.session.commit()
    return redirect(request.referrer or url_for("index"))


@app.post("/delete/<int:task_id>")
def delete(task_id):
    task = db.session.get(Todo, task_id) or abort(404)
    db.session.delete(task)
    db.session.commit()
    return redirect(url_for("index"))


@app.route("/update/<int:task_id>", methods=["GET", "POST"])
def update(task_id):
    task = db.session.get(Todo, task_id) or abort(404)
    if request.method == "POST":
        apply_form(task)
        db.session.commit()
        return redirect(url_for("index"))
    return render_template("update.html", task=task)


def migrate_database():
    """Add planner fields to databases created by the original todo app."""
    existing = {column["name"] for column in inspect(db.engine).get_columns("todo")}
    additions = {
        "course": "VARCHAR(80) NOT NULL DEFAULT 'General'", "item_type": "VARCHAR(20) NOT NULL DEFAULT 'assignment'",
        "priority": "VARCHAR(10) NOT NULL DEFAULT 'medium'", "due_date": "DATE", "due_time": "TIME",
        "notes": "TEXT NOT NULL DEFAULT ''", "recurrence": "VARCHAR(20) NOT NULL DEFAULT 'none'",
        "completed": "BOOLEAN NOT NULL DEFAULT 0", "completed_at": "DATETIME",
    }
    for name, definition in additions.items():
        if name not in existing:
            db.session.execute(text(f"ALTER TABLE todo ADD COLUMN {name} {definition}"))
    db.session.commit()


with app.app_context():
    Path(app.instance_path).mkdir(parents=True, exist_ok=True)
    db.create_all()
    migrate_database()

if __name__ == "__main__":
    app.run(debug=True)
